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

    const isArrayPayload = Array.isArray(body);
    const items = isArrayPayload ? body : [body];
    if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: "Itens inválidos" }, { status: 400 });

    const withId: Array<{ inventoryItemId: number; unitPrice: number }> = [];
    const withSku: Array<{ sku: string; unitPrice: number }> = [];

    for (const it of items) {
      if (!it || typeof it !== "object") return NextResponse.json({ error: "Item inválido" }, { status: 400 });
      const invIdRaw = Number((it as any)?.inventoryItemId);
      const invId = Number.isFinite(invIdRaw) ? Math.trunc(invIdRaw) : NaN;
      const sku = String((it as any)?.sku ?? (it as any)?.itemCode ?? "").trim();
      const unitPriceRaw = parsePrice((it as any)?.unitPrice);
      const unitPrice = unitPriceRaw !== null ? unitPriceRaw : NaN;
      if (!Number.isFinite(unitPrice) || unitPrice < 0) return NextResponse.json({ error: "Preço unitário inválido" }, { status: 400 });

      if (Number.isFinite(invId) && invId > 0) {
        withId.push({ inventoryItemId: invId, unitPrice });
        continue;
      }
      if (!sku) return NextResponse.json({ error: "Item inválido" }, { status: 400 });
      withSku.push({ sku, unitPrice });
    }

    const skuList = Array.from(new Set(withSku.map((x) => x.sku)));
    const skuMap = new Map<string, number>();
    if (skuList.length) {
      const found = await prisma.inventoryItem.findMany({
        where: { sku: { in: skuList } },
        select: { id: true, sku: true },
      });
      for (const r of found) {
        const s = String((r as any)?.sku || "").trim();
        const id = Number((r as any)?.id);
        if (!s || !Number.isFinite(id) || id <= 0) continue;
        skuMap.set(s, Math.trunc(id));
      }
      const missing = skuList.filter((s) => !skuMap.has(s));
      if (missing.length) return NextResponse.json({ error: "Item não encontrado", missingSkus: missing }, { status: 404 });
    }

    const rowsToUpsert: Array<{ inventoryItemId: number; unitPrice: number }> = [
      ...withId,
      ...withSku.map((x) => ({ inventoryItemId: skuMap.get(x.sku) as number, unitPrice: x.unitPrice })),
    ].filter((x) => Number.isFinite(x.inventoryItemId) && x.inventoryItemId > 0);

    const upserted = await prisma.$transaction(async (tx) => {
      const out: any[] = [];
      for (const row of rowsToUpsert) {
        const u = await tx.priceTableItem.upsert({
          where: {
            priceTableId_inventoryItemId: {
              priceTableId: Math.trunc(priceTableId),
              inventoryItemId: row.inventoryItemId,
            },
          },
          update: { unitPrice: row.unitPrice },
          create: { priceTableId: Math.trunc(priceTableId), inventoryItemId: row.inventoryItemId, unitPrice: row.unitPrice },
          select: { inventoryItemId: true, unitPrice: true },
        });
        out.push(u);
      }
      return out;
    });

    return NextResponse.json(isArrayPayload ? upserted : upserted[0]);
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
