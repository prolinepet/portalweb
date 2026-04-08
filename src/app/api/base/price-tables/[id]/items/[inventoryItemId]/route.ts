import { NextResponse } from "next/server";
import { prisma } from "../../../../../../../lib/prisma";

export async function DELETE(_: Request, props: { params: Promise<{ id: string; inventoryItemId: string }> }) {
  const params = await props.params;
  try {
    const priceTableId = Number(params.id);
    const inventoryItemId = Number(params.inventoryItemId);
    if (!Number.isFinite(priceTableId) || priceTableId <= 0) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    if (!Number.isFinite(inventoryItemId) || inventoryItemId <= 0) return NextResponse.json({ error: "Item inválido" }, { status: 400 });

    await prisma.priceTableItem.delete({
      where: {
        priceTableId_inventoryItemId: {
          priceTableId: Math.trunc(priceTableId),
          inventoryItemId: Math.trunc(inventoryItemId),
        },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

