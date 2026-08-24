import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import {
  ensureFinancialTitleTable,
  FINANCIAL_TITLE_KIND,
  FINANCIAL_TITLE_STATUS,
  generateFinancialTitleNumber,
  normalizeDueDate,
  normalizeFinancialTitleKind,
  normalizeFinancialTitleStatus,
  parseFinancialAmount,
  resolveActiveEntityId,
} from "../../../../lib/financial-titles";

export const dynamic = "force-dynamic";

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

    const { entityId, userId } = await resolveActiveEntityId();
    if (!entityId) {
      return NextResponse.json({ error: "Entidade ativa não definida" }, { status: 400 });
    }
    if (!userId) {
      return NextResponse.json({ error: "Usuário autenticado não encontrado" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const kind = normalizeFinancialTitleKind(body?.kind) ?? FINANCIAL_TITLE_KIND.PAGAR;
    const dueDate = normalizeDueDate(body?.dueDate);
    const amount = parseFinancialAmount(body?.amount);
    const status = normalizeFinancialTitleStatus(body?.status) ?? FINANCIAL_TITLE_STATUS.ABERTO;
    const description = String(body?.description || "").trim() || null;
    const integrated = Boolean(body?.integrated);

    if (!dueDate) {
      return NextResponse.json({ error: "Data de vencimento inválida" }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Valor inválido" }, { status: 400 });
    }

    let reimbursementTypeId: number | null = null;
    if (body?.reimbursementTypeId !== undefined && body?.reimbursementTypeId !== null && String(body.reimbursementTypeId).trim() !== "") {
      reimbursementTypeId = Number(body.reimbursementTypeId);
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
      reimbursementTypeId = Math.trunc(reimbursementTypeId);
    }

    let numero = String(body?.numero || "").trim().toUpperCase();
    if (!numero) {
      numero = await generateFinancialTitleNumber(entityId, kind);
    }

    const created = await prisma.financialTitle.create({
      data: {
        entityId,
        createdByUserId: userId,
        reimbursementTypeId,
        kind,
        numero,
        dueDate,
        amount,
        status,
        integrated,
        description,
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

    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    const message = String(err?.message || err);
    if (message.toLowerCase().includes("unique")) {
      return NextResponse.json({ error: "Já existe um título com esse número para a entidade ativa" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
