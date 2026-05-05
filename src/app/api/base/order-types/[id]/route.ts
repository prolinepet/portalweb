import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";

function parseKind(raw: unknown): "VENDA" | "BONIFICACAO" | "AMOSTRA" | undefined {
  const s = String(raw ?? "").trim().toUpperCase();
  if (!s) return undefined;
  if (s === "VENDA") return "VENDA";
  if (s === "BONIFICAÇÃO" || s === "BONIFICACAO") return "BONIFICACAO";
  if (s === "AMOSTRA") return "AMOSTRA";
  return undefined;
}

export async function GET(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = Number(params.id);
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const row = await prisma.orderType.findUnique({
      where: { id: Math.trunc(id) },
      select: {
        id: true,
        codtipoped: true,
        kind: true,
        descricao: true,
        situacao: true,
        priceTables: {
          orderBy: { priceTable: { descricao: "asc" } },
          select: {
            priceTableId: true,
            priceTable: { select: { nrtabpre: true, descricao: true, situacao: true } },
          },
        },
      },
    });

    if (!row) return NextResponse.json({ error: "Tipo de pedido não encontrado" }, { status: 404 });

    return NextResponse.json({
      id: row.id,
      codtipoped: row.codtipoped,
      kind: (row as any).kind,
      descricao: row.descricao,
      situacao: row.situacao,
      priceTables: (row.priceTables || []).map((l) => ({
        priceTableId: l.priceTableId,
        nrtabpre: l.priceTable?.nrtabpre ?? null,
        descricao: l.priceTable?.descricao ?? null,
        situacao: l.priceTable?.situacao ?? null,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = Number(params.id);
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const data: any = {};

    if (body?.codtipoped !== undefined) {
      const codtipopedRaw = Number(body?.codtipoped);
      const codtipoped = Number.isFinite(codtipopedRaw) ? Math.trunc(codtipopedRaw) : NaN;
      if (!Number.isFinite(codtipoped) || codtipoped <= 0) return NextResponse.json({ error: "Cód Tipo Ped é obrigatório" }, { status: 400 });
      if (String(codtipoped).length > 6) return NextResponse.json({ error: "Cód Tipo Ped excede 6 dígitos" }, { status: 400 });
      data.codtipoped = codtipoped;
    }

    if (body?.kind !== undefined) {
      const kind = parseKind(body?.kind);
      if (!kind) return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
      data.kind = kind;
    }

    if (body?.descricao !== undefined) {
      const descricao = String(body?.descricao || "").trim();
      if (!descricao) return NextResponse.json({ error: "Descrição é obrigatória" }, { status: 400 });
      if (descricao.length > 40) return NextResponse.json({ error: "Descrição excede 40 caracteres" }, { status: 400 });
      data.descricao = descricao;
    }

    if (body?.situacao !== undefined) {
      const situacaoRaw = Number(body?.situacao);
      const situacao = Number.isFinite(situacaoRaw) ? Math.trunc(situacaoRaw) : NaN;
      if (![1, 2].includes(situacao)) return NextResponse.json({ error: "Situação inválida" }, { status: 400 });
      data.situacao = situacao;
    }

    const updated = await prisma.orderType.update({
      where: { id: Math.trunc(id) },
      data,
      select: { id: true, codtipoped: true, kind: true, descricao: true, situacao: true },
    });
    return NextResponse.json(updated);
  } catch (err: any) {
    const msg = String(err?.message || err);
    const isUnique = msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("duplicate");
    return NextResponse.json({ error: isUnique ? "Cód Tipo Ped já existe" : msg }, { status: isUnique ? 409 : 500 });
  }
}

export async function DELETE(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = Number(params.id);
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    await prisma.orderType.delete({ where: { id: Math.trunc(id) } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
