import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import {
  ensureFinancialTitleTable,
  normalizeDueDate,
  normalizeFinancialTitleKind,
  normalizeFinancialTitleStatus,
  parseFinancialAmount,
  resolveActiveEntityId,
} from "../../../../../lib/financial-titles";

function parseId(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
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

    const body = await request.json().catch(() => ({}));
    const data: Record<string, unknown> = {};

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

    if (body?.dueDate !== undefined) {
      const dueDate = normalizeDueDate(body.dueDate);
      if (!dueDate) {
        return NextResponse.json({ error: "Data de vencimento inválida" }, { status: 400 });
      }
      data.dueDate = dueDate;
    }

    if (body?.amount !== undefined) {
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

    if (body?.description !== undefined) {
      const description = String(body.description || "").trim();
      data.description = description || null;
    }

    if (body?.reimbursementTypeId !== undefined) {
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

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
    }

    const updated = await prisma.financialTitle.update({
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
        reimbursementTypeId: true,
      },
    });

    return NextResponse.json(updated);
  } catch (err: any) {
    const message = String(err?.message || err);
    if (message.toLowerCase().includes("unique")) {
      return NextResponse.json({ error: "Já existe um título com esse número para a entidade ativa" }, { status: 409 });
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
