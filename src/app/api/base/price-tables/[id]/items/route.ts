import { NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";

function parsePrice(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const raw = v.trim();
  if (!raw) return null;

  const compact = raw.replace(/\s+/g, "");
  const hasDot = compact.includes(".");
  const hasComma = compact.includes(",");

  let normalized = compact;
  if (hasDot && hasComma) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (hasComma && !hasDot) {
    normalized = normalized.replace(",", ".");
  }

  normalized = normalized.replace(/[^0-9.-]/g, "");
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

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

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    const inventoryItemIdRaw = Number(body?.inventoryItemId);
    let inventoryItemId = Number.isFinite(inventoryItemIdRaw) ? Math.trunc(inventoryItemIdRaw) : NaN;
    if (!Number.isFinite(inventoryItemId) || inventoryItemId <= 0) {
      const sku = String(body?.sku ?? "").trim();
      if (!sku) return NextResponse.json({ error: "Item inválido" }, { status: 400 });
      const item = await prisma.inventoryItem.findUnique({ where: { sku }, select: { id: true } });
      if (!item) return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });
      inventoryItemId = item.id;
    }
    const unitPriceRaw = parsePrice(body?.unitPrice);
    const unitPrice = unitPriceRaw !== null ? unitPriceRaw : NaN;

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

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const priceTableId = Number(params.id);
    if (!Number.isFinite(priceTableId) || priceTableId <= 0) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const url = new URL(request.url);
    const sku = String(url.searchParams.get("sku") ?? "").trim();
    const inventoryItemIdRaw = Number(url.searchParams.get("inventoryItemId"));
    let inventoryItemId = Number.isFinite(inventoryItemIdRaw) ? Math.trunc(inventoryItemIdRaw) : NaN;

    if (!Number.isFinite(inventoryItemId) || inventoryItemId <= 0) {
      if (!sku) return NextResponse.json({ error: "Item inválido" }, { status: 400 });
      const item = await prisma.inventoryItem.findUnique({ where: { sku }, select: { id: true } });
      if (!item) return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });
      inventoryItemId = item.id;
    }

    const deleted = await prisma.priceTableItem.deleteMany({
      where: { priceTableId: Math.trunc(priceTableId), inventoryItemId },
    });

    if (!deleted.count) return NextResponse.json({ error: "Item da tabela de preço não encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
