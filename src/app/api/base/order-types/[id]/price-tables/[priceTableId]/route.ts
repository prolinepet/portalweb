import { NextResponse } from "next/server";
import { prisma } from "../../../../../../../lib/prisma";

export async function DELETE(_: Request, props: { params: Promise<{ id: string; priceTableId: string }> }) {
  const params = await props.params;
  try {
    const orderTypeId = Number(params.id);
    const priceTableId = Number(params.priceTableId);
    if (!Number.isFinite(orderTypeId) || orderTypeId <= 0) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    if (!Number.isFinite(priceTableId) || priceTableId <= 0) return NextResponse.json({ error: "Tabela de preço inválida" }, { status: 400 });

    await prisma.orderTypePriceTable.delete({
      where: {
        orderTypeId_priceTableId: {
          orderTypeId: Math.trunc(orderTypeId),
          priceTableId: Math.trunc(priceTableId),
        },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

