import { NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";

export async function GET(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = Number(params.id);
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const rows = await prisma.orderTypePriceTable.findMany({
      where: { orderTypeId: Math.trunc(id) },
      orderBy: { priceTable: { descricao: "asc" } },
      select: {
        priceTableId: true,
        priceTable: { select: { nrtabpre: true, descricao: true, situacao: true } },
      },
    });

    return NextResponse.json(
      rows.map((l) => ({
        priceTableId: l.priceTableId,
        nrtabpre: l.priceTable?.nrtabpre ?? null,
        descricao: l.priceTable?.descricao ?? null,
        situacao: l.priceTable?.situacao ?? null,
      }))
    );
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const orderTypeId = Number(params.id);
    if (!Number.isFinite(orderTypeId) || orderTypeId <= 0) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const priceTableIdRaw = Number(body?.priceTableId);
    const priceTableId = Number.isFinite(priceTableIdRaw) ? Math.trunc(priceTableIdRaw) : NaN;
    if (!Number.isFinite(priceTableId) || priceTableId <= 0) return NextResponse.json({ error: "Tabela de preço inválida" }, { status: 400 });

    const upserted = await prisma.orderTypePriceTable.upsert({
      where: {
        orderTypeId_priceTableId: {
          orderTypeId: Math.trunc(orderTypeId),
          priceTableId,
        },
      },
      update: {},
      create: { orderTypeId: Math.trunc(orderTypeId), priceTableId },
      select: { orderTypeId: true, priceTableId: true },
    });

    return NextResponse.json(upserted);
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

