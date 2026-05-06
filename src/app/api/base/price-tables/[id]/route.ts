import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../lib/auth";

export async function GET(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = Number(params.id);
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const row = await prisma.priceTable.findUnique({
      where: { id: Math.trunc(id) },
      select: {
        id: true,
        nrtabpre: true,
        descricao: true,
        situacao: true,
        items: {
          orderBy: { inventoryItem: { name: "asc" } },
          select: {
            inventoryItemId: true,
            unitPrice: true,
            inventoryItem: { select: { sku: true, name: true, unit: true } },
          },
        },
      },
    });

    if (!row) return NextResponse.json({ error: "Tabela de preço não encontrada" }, { status: 404 });

    return NextResponse.json({
      id: row.id,
      nrtabpre: row.nrtabpre,
      descricao: row.descricao,
      situacao: row.situacao,
      items: (row.items || []).map((it) => ({
        inventoryItemId: it.inventoryItemId,
        sku: it.inventoryItem?.sku ?? null,
        name: it.inventoryItem?.name ?? null,
        unit: it.inventoryItem?.unit ?? null,
        unitPrice: it.unitPrice,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    const shouldUnlinkItems = !session;

    const id = Number(params.id);
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const data: any = {};

    if (body?.nrtabpre !== undefined) {
      const nrtabpre = String(body?.nrtabpre || "").trim();
      if (!nrtabpre) return NextResponse.json({ error: "Cód Tab é obrigatório" }, { status: 400 });
      if (nrtabpre.length > 20) return NextResponse.json({ error: "Cód Tab excede 20 caracteres" }, { status: 400 });
      data.nrtabpre = nrtabpre;
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

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.priceTable.update({
        where: { id: Math.trunc(id) },
        data,
        select: { id: true, nrtabpre: true, descricao: true, situacao: true },
      });
      if (shouldUnlinkItems) {
        await tx.priceTableItem.deleteMany({ where: { priceTableId: row.id } });
      }
      return row;
    });
    return NextResponse.json(updated);
  } catch (err: any) {
    const msg = String(err?.message || err);
    const isUnique = msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("duplicate");
    return NextResponse.json({ error: isUnique ? "Cód Tab já existe" : msg }, { status: isUnique ? 409 : 500 });
  }
}

export async function DELETE(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = Number(params.id);
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    await prisma.priceTable.delete({ where: { id: Math.trunc(id) } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
