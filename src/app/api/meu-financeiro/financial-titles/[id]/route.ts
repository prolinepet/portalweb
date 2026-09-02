import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import {
  buildFinancialTitleSummary,
  ensureFinancialTitleExpenseAttachmentTable,
  ensureFinancialTitleExpenseTable,
  ensureFinancialTitleTable,
  normalizeFinancialTitleKind,
  normalizeFinancialTitleStatus,
  parseFinancialAmount,
  resolveActiveEntityId,
} from "../../../../../lib/financial-titles";

function parseId(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

type ExpenseItemPayload = {
  id?: number;
  clientKey?: string | null;
  reimbursementTypeId: number;
  description: string;
  amount: number;
};

async function parseExpenseItemsPayload(rawItems: any[]) {
  const items: ExpenseItemPayload[] = [];

  for (const rawItem of rawItems) {
    const reimbursementTypeId = Number(rawItem?.reimbursementTypeId);
    if (!Number.isFinite(reimbursementTypeId) || reimbursementTypeId <= 0) {
      throw new Error("Tipo de despesa inválido");
    }

    const reimbursementType = await prisma.reimbursementType.findUnique({
      where: { id: Math.trunc(reimbursementTypeId) },
      select: { id: true },
    });
    if (!reimbursementType?.id) {
      throw new Error("Tipo de despesa não encontrado");
    }

    const description = String(rawItem?.description || "").trim();
    if (!description) {
      throw new Error("Informe a descrição da despesa");
    }

    const amount = parseFinancialAmount(rawItem?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Valor da despesa inválido");
    }

    const id = rawItem?.id === undefined || rawItem?.id === null || String(rawItem.id).trim() === "" ? undefined : Number(rawItem.id);
    if (id !== undefined && (!Number.isFinite(id) || id <= 0)) {
      throw new Error("Despesa inválida");
    }

    items.push({
      id: id ? Math.trunc(id) : undefined,
      clientKey: rawItem?.clientKey ? String(rawItem.clientKey) : null,
      reimbursementTypeId: Math.trunc(reimbursementTypeId),
      description,
      amount,
    });
  }

  if (items.length === 0) {
    throw new Error("Adicione ao menos uma despesa ao reembolso");
  }

  return items;
}

export async function GET(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;

  try {
    await ensureFinancialTitleTable();
    await ensureFinancialTitleExpenseTable();
    await ensureFinancialTitleExpenseAttachmentTable();

    const id = parseId(params.id);
    if (!id) {
      return NextResponse.json({ error: "Id inválido" }, { status: 400 });
    }

    const { entityId } = await resolveActiveEntityId();
    if (!entityId) {
      return NextResponse.json({ error: "Entidade ativa não definida" }, { status: 400 });
    }

    const current = await prisma.financialTitle.findFirst({
      where: { id, entityId },
      select: {
        id: true,
        kind: true,
        numero: true,
        dueDate: true,
        amount: true,
        status: true,
        integrated: true,
        description: true,
        createdByUserId: true,
        reimbursementTypeId: true,
        expenseItems: {
          orderBy: [{ id: "asc" }],
          select: {
            id: true,
            reimbursementTypeId: true,
            description: true,
            amount: true,
            reimbursementType: { select: { id: true, description: true } },
            _count: { select: { attachments: true } },
          },
        },
      },
    });
    if (!current?.id) {
      return NextResponse.json({ error: "Título não encontrado" }, { status: 404 });
    }

    return NextResponse.json(current);
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;

  try {
    await ensureFinancialTitleTable();
    await ensureFinancialTitleExpenseTable();
    await ensureFinancialTitleExpenseAttachmentTable();

    const id = parseId(params.id);
    if (!id) {
      return NextResponse.json({ error: "Id inválido" }, { status: 400 });
    }

    const { entityId } = await resolveActiveEntityId();
    if (!entityId) {
      return NextResponse.json({ error: "Entidade ativa não definida" }, { status: 400 });
    }

    const current = await prisma.financialTitle.findFirst({
      where: { id, entityId },
      select: { id: true, integrated: true },
    });
    if (!current?.id) {
      return NextResponse.json({ error: "Título não encontrado" }, { status: 404 });
    }
    if (current.integrated) {
      return NextResponse.json({ error: "Reembolso integrado pode apenas ser visualizado" }, { status: 409 });
    }

    const body = await request.json().catch(() => ({}));
    const data: Record<string, unknown> = {};
    const expenseItems = Array.isArray(body?.expenseItems) ? await parseExpenseItemsPayload(body.expenseItems) : null;

    if (body?.kind !== undefined) {
      const kind = normalizeFinancialTitleKind(body.kind);
      if (!kind) {
        return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
      }
      data.kind = kind;
    }

    if (body?.numero !== undefined) {
      const numero = String(body.numero || "").trim().toUpperCase();
      if (!numero) {
        return NextResponse.json({ error: "Número do título é obrigatório" }, { status: 400 });
      }
      data.numero = numero;
    }

    if (body?.amount !== undefined && !expenseItems) {
      const amount = parseFinancialAmount(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: "Valor inválido" }, { status: 400 });
      }
      data.amount = amount;
    }

    if (body?.status !== undefined) {
      const status = normalizeFinancialTitleStatus(body.status);
      if (!status) {
        return NextResponse.json({ error: "Situação inválida" }, { status: 400 });
      }
      data.status = status;
    }

    if (body?.integrated !== undefined) {
      data.integrated = Boolean(body.integrated);
    }

    if (body?.description !== undefined && !expenseItems) {
      const description = String(body.description || "").trim();
      data.description = description || null;
    }

    if (body?.reimbursementTypeId !== undefined && !expenseItems) {
      if (body.reimbursementTypeId === null || String(body.reimbursementTypeId).trim() === "") {
        data.reimbursementTypeId = null;
      } else {
        const reimbursementTypeId = Number(body.reimbursementTypeId);
        if (!Number.isFinite(reimbursementTypeId) || reimbursementTypeId <= 0) {
          return NextResponse.json({ error: "Tipo de reembolso inválido" }, { status: 400 });
        }
        const reimbursementType = await prisma.reimbursementType.findUnique({
          where: { id: Math.trunc(reimbursementTypeId) },
          select: { id: true },
        });
        if (!reimbursementType?.id) {
          return NextResponse.json({ error: "Tipo de reembolso não encontrado" }, { status: 404 });
        }
        data.reimbursementTypeId = Math.trunc(reimbursementTypeId);
      }
    }

    if (expenseItems) {
      const summary = buildFinancialTitleSummary(expenseItems);
      data.amount = summary.amount;
      data.description = summary.description;
      data.reimbursementTypeId = summary.reimbursementTypeId;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const title = await tx.financialTitle.update({
        where: { id },
        data,
        select: {
          id: true,
          kind: true,
          numero: true,
          dueDate: true,
          amount: true,
          status: true,
          integrated: true,
          description: true,
          createdByUserId: true,
          reimbursementTypeId: true,
        },
      });

      if (expenseItems) {
        const currentItems = await tx.financialTitleExpense.findMany({
          where: { financialTitleId: id },
          select: { id: true },
        });
        const currentIds = new Set(currentItems.map((item) => item.id));
        const nextIds = new Set(expenseItems.map((item) => item.id).filter((value): value is number => Number.isFinite(value)));

        for (const item of expenseItems) {
          if (item.id && currentIds.has(item.id)) {
            await tx.financialTitleExpense.update({
              where: { id: item.id },
              data: {
                reimbursementTypeId: item.reimbursementTypeId,
                description: item.description,
                amount: item.amount,
              },
            });
          } else {
            const createdItem = await tx.financialTitleExpense.create({
              data: {
                financialTitleId: id,
                reimbursementTypeId: item.reimbursementTypeId,
                description: item.description,
                amount: item.amount,
              },
            });
            item.id = createdItem.id;
          }
        }

        const idsToDelete = [...currentIds].filter((currentId) => !nextIds.has(currentId) && !expenseItems.some((item) => item.id === currentId));
        if (idsToDelete.length > 0) {
          await tx.financialTitleExpense.deleteMany({
            where: {
              financialTitleId: id,
              id: { in: idsToDelete },
            },
          });
        }
      }

      const persistedExpenseItems = await tx.financialTitleExpense.findMany({
        where: { financialTitleId: id },
        orderBy: [{ id: "asc" }],
        select: {
          id: true,
          reimbursementTypeId: true,
          description: true,
          amount: true,
          reimbursementType: { select: { id: true, description: true } },
          _count: { select: { attachments: true } },
        },
      });

      return {
        ...title,
        expenseItems: persistedExpenseItems.map((item) => ({
          ...item,
          clientKey: expenseItems?.find((candidate) => candidate.id === item.id)?.clientKey || null,
        })),
      };
    });

    return NextResponse.json(updated);
  } catch (err: any) {
    const message = String(err?.message || err);
    if (
      [
        "Tipo de despesa inválido",
        "Tipo de despesa não encontrado",
        "Informe a descrição da despesa",
        "Valor da despesa inválido",
        "Despesa inválida",
        "Adicione ao menos uma despesa ao reembolso",
      ].includes(message)
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (message.toLowerCase().includes("unique")) {
      return NextResponse.json({ error: "Já existe um título com esse número para o usuário atual na entidade ativa" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;

  try {
    await ensureFinancialTitleTable();

    const id = parseId(params.id);
    if (!id) {
      return NextResponse.json({ error: "Id inválido" }, { status: 400 });
    }

    const { entityId } = await resolveActiveEntityId();
    if (!entityId) {
      return NextResponse.json({ error: "Entidade ativa não definida" }, { status: 400 });
    }

    const current = await prisma.financialTitle.findFirst({
      where: { id, entityId },
      select: { id: true },
    });
    if (!current?.id) {
      return NextResponse.json({ error: "Título não encontrado" }, { status: 404 });
    }

    await prisma.financialTitle.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
