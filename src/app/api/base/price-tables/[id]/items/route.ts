import { NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";

export async function GET(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = Number(params.id);
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const rows = await prisma.priceTableItem.findMany({
      where: { priceTableId: Math.trunc(id) },
      orderBy: { inventoryItem: { name: "asc" } },
      select: {
        inventoryItemId: true,
        unitPrice: true,
        inventoryItem: { select: { sku: true, name: true, unit: true } },
      },
    });

    return NextResponse.json(
      rows.map((r) => ({
        inventoryItemId: r.inventoryItemId,
        sku: r.inventoryItem?.sku ?? null,
        name: r.inventoryItem?.name ?? null,
        unit: r.inventoryItem?.unit ?? null,
        unitPrice: r.unitPrice,
      }))
    );
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const priceTableId = Number(params.id);
    if (!Number.isFinite(priceTableId) || priceTableId <= 0) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const inventoryItemIdRaw = Number(body?.inventoryItemId);
    const inventoryItemId = Number.isFinite(inventoryItemIdRaw) ? Math.trunc(inventoryItemIdRaw) : NaN;
    const unitPriceRaw = Number(body?.unitPrice);
    const unitPrice = Number.isFinite(unitPriceRaw) ? unitPriceRaw : NaN;

    if (!Number.isFinite(inventoryItemId) || inventoryItemId <= 0) return NextResponse.json({ error: "Item inválido" }, { status: 400 });
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return NextResponse.json({ error: "Preço unitário inválido" }, { status: 400 });

    const upserted = await prisma.priceTableItem.upsert({
      where: {
        priceTableId_inventoryItemId: {
          priceTableId: Math.trunc(priceTableId),
          inventoryItemId,
        },
      },
      update: { unitPrice },
      create: { priceTableId: Math.trunc(priceTableId), inventoryItemId, unitPrice },
      select: { inventoryItemId: true, unitPrice: true },
    });

    return NextResponse.json(upserted);
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

