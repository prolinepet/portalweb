import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import {
  buildFinancialTitleSummary,
  ensureFinancialTitleExpenseAttachmentTable,
  ensureFinancialTitleExpenseTable,
  ensureFinancialTitleTable,
  FINANCIAL_TITLE_KIND,
  FINANCIAL_TITLE_STATUS,
  generateFinancialTitleNumber,
  normalizeFinancialTitleKind,
  normalizeFinancialTitleStatus,
  parseFinancialAmount,
  resolveActiveEntityId,
} from "../../../../lib/financial-titles";

export const dynamic = "force-dynamic";

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

function buildWhere(entityId: number, url: URL) {
  const kind = normalizeFinancialTitleKind(url.searchParams.get("kind"));
  const status = normalizeFinancialTitleStatus(url.searchParams.get("status"));
  const q = String(url.searchParams.get("q") || "").trim();

  return {
    entityId,
    ...(kind ? { kind } : {}),
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { numero: { contains: q } },
            { description: { contains: q } },
          ],
        }
      : {}),
  };
}

export async function GET(request: Request) {
  try {
    await ensureFinancialTitleTable();
    await ensureFinancialTitleExpenseTable();
    await ensureFinancialTitleExpenseAttachmentTable();

    const { entityId } = await resolveActiveEntityId();
    if (!entityId) {
      return NextResponse.json({ error: "Entidade ativa não definida" }, { status: 400 });
    }

    const url = new URL(request.url);
    const rows = await prisma.financialTitle.findMany({
      where: buildWhere(entityId, url),
      orderBy: [{ dueDate: "asc" }, { numero: "asc" }],
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

    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureFinancialTitleTable();
    await ensureFinancialTitleExpenseTable();
    await ensureFinancialTitleExpenseAttachmentTable();

    const { entityId, userId } = await resolveActiveEntityId();
    if (!entityId) {
      return NextResponse.json({ error: "Entidade ativa não definida" }, { status: 400 });
    }
    if (!userId) {
      return NextResponse.json({ error: "Usuário autenticado não encontrado" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const kind = normalizeFinancialTitleKind(body?.kind) ?? FINANCIAL_TITLE_KIND.RECEBER;
    const status = normalizeFinancialTitleStatus(body?.status) ?? FINANCIAL_TITLE_STATUS.ABERTO;
    const integrated = Boolean(body?.integrated);
    const expenseItems = await parseExpenseItemsPayload(Array.isArray(body?.expenseItems) ? body.expenseItems : []);
    const summary = buildFinancialTitleSummary(expenseItems);

    let numero = String(body?.numero || "").trim().toUpperCase();
    if (!numero) {
      numero = await generateFinancialTitleNumber(entityId, userId);
    }

    const created = await prisma.$transaction(async (tx) => {
      const title = await tx.financialTitle.create({
        data: {
          entityId,
          createdByUserId: userId,
          reimbursementTypeId: summary.reimbursementTypeId,
          kind,
          numero,
          dueDate: null,
          amount: summary.amount,
          status,
          integrated,
          description: summary.description,
        },
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

      const createdExpenseItems: Array<{
        id: number;
        financialTitleId: number;
        reimbursementTypeId: number;
        description: string;
        amount: number;
        reimbursementType: { id: number; description: string };
        clientKey: string | null;
      }> = [];
      for (const item of expenseItems) {
        const createdItem = await tx.financialTitleExpense.create({
          data: {
            financialTitleId: title.id,
            reimbursementTypeId: item.reimbursementTypeId,
            description: item.description,
            amount: item.amount,
          },
          select: {
            id: true,
            financialTitleId: true,
            reimbursementTypeId: true,
            description: true,
            amount: true,
            reimbursementType: { select: { id: true, description: true } },
          },
        });

        createdExpenseItems.push({
          ...createdItem,
          clientKey: item.clientKey || null,
        });
      }

      return {
        ...title,
        expenseItems: createdExpenseItems,
      };
    });

    return NextResponse.json(created, { status: 201 });
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
