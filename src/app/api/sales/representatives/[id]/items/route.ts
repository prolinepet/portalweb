import { NextResponse } from 'next/server';
import { prisma } from '../../../../../../lib/prisma';

function toPositiveInt(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function toUnit(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  return s ? s : null;
}

function toPrice(raw: unknown): number {
  const n = Number(String(raw ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function key(invId: number, unit: string) {
  return `${invId}::${unit}`;
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const repUserId = toPositiveInt(params.id);
    if (!repUserId) return NextResponse.json({ error: 'userId inválido' }, { status: 400 });

    const rawBody = await request.json().catch(() => ({} as any));
    const listRaw = Array.isArray(rawBody) ? rawBody : Array.isArray((rawBody as any)?.items) ? (rawBody as any).items : [rawBody];
    const fullReplace = Boolean((rawBody as any)?.fullReplace);

    const withId: any[] = [];
    const withSku: { body: any; sku: string }[] = [];
    for (const body of listRaw) {
      const invId = toPositiveInt((body as any)?.inventoryItemId);
      if (invId) {
        withId.push({ body, inventoryItemId: invId });
        continue;
      }
      const sku = String((body as any)?.itemCode || (body as any)?.sku || '').trim();
      if (!sku) continue;
      withSku.push({ body, sku });
    }

    const skuList = Array.from(new Set(withSku.map((x) => x.sku)));
    const skuMap = new Map<string, number>();
    if (skuList.length) {
      const found = await prisma.inventoryItem.findMany({
        where: { sku: { in: skuList } },
        select: { id: true, sku: true },
      });
      for (const it of found) {
        if (it.sku) skuMap.set(it.sku, it.id);
      }
    }

    const normalized = new Map<string, { inventoryItemId: number; unit: string; unitPrice: number }>();
    for (const { body, inventoryItemId } of withId) {
      const unit = toUnit((body as any)?.unit);
      if (!unit) continue;
      normalized.set(key(inventoryItemId, unit), { inventoryItemId, unit, unitPrice: toPrice((body as any)?.unitPrice) });
    }
    for (const { body, sku } of withSku) {
      const inventoryItemId = skuMap.get(sku);
      if (!inventoryItemId) continue;
      const unit = toUnit((body as any)?.unit);
      if (!unit) continue;
      normalized.set(key(inventoryItemId, unit), { inventoryItemId, unit, unitPrice: toPrice((body as any)?.unitPrice) });
    }

    const records = Array.from(normalized.values());
    if (records.length === 0) return NextResponse.json({ ok: true, upserted: 0, updatedClientItems: 0, skippedClientItems: 0 });

    const invIds = Array.from(new Set(records.map((r) => r.inventoryItemId)));
    const unitSet = Array.from(new Set(records.map((r) => r.unit)));
    const newPriceByKey = new Map<string, number>();
    for (const r of records) newPriceByKey.set(key(r.inventoryItemId, r.unit), Number(r.unitPrice ?? 0));

    const result = await prisma.$transaction(async (tx) => {
      const oldRows = await tx.userInventoryItemPrice.findMany({
        where: { userId: repUserId, inventoryItemId: { in: invIds }, unit: { in: unitSet } },
        select: { inventoryItemId: true, unit: true, unitPrice: true },
      });
      const oldPriceByKey = new Map<string, number>();
      for (const r of oldRows) {
        const u = String(r.unit || '').trim();
        if (!u) continue;
        oldPriceByKey.set(key(r.inventoryItemId, u), Number(r.unitPrice ?? 0));
      }

      for (const r of records) {
        await tx.userInventoryItemPrice.upsert({
          where: { userId_inventoryItemId_unit: { userId: repUserId, inventoryItemId: r.inventoryItemId, unit: r.unit } },
          update: { unitPrice: r.unitPrice },
          create: { userId: repUserId, inventoryItemId: r.inventoryItemId, unit: r.unit, unitPrice: r.unitPrice },
        });
      }

      if (Array.isArray(rawBody) || fullReplace) {
        const keepOr: any[] = records.map((r) => ({ inventoryItemId: r.inventoryItemId, unit: r.unit }));
        if (keepOr.length > 0) {
          await tx.userInventoryItemPrice.deleteMany({
            where: { userId: repUserId, NOT: { OR: keepOr } },
          });
        }
      }

      const repClients = await tx.userClientRep.findMany({
        where: { userId: repUserId },
        select: { clientId: true },
      });
      const clientIds = Array.from(new Set(repClients.map((c) => Number(c.clientId)).filter((n) => Number.isFinite(n) && n > 0)));
      if (clientIds.length === 0) return { upserted: records.length, updatedClientItems: 0, skippedClientItems: 0 };

      const clientItems = await tx.clientItem.findMany({
        where: { clientId: { in: clientIds }, inventoryItemId: { in: invIds }, allowed: true },
        select: { id: true, inventoryItemId: true, unit: true, unitPrice: true, inventoryItem: { select: { unit: true } } },
      });

      let updatedClientItems = 0;
      let skippedClientItems = 0;

      for (const ci of clientItems) {
        const invId = Number(ci.inventoryItemId);
        const unit = String(ci.unit ?? ci.inventoryItem?.unit ?? '').trim();
        if (!Number.isFinite(invId) || invId <= 0 || !unit) {
          skippedClientItems += 1;
          continue;
        }

        const oldBase = oldPriceByKey.get(key(invId, unit));
        const newBase = newPriceByKey.get(key(invId, unit));
        const current = Number(ci.unitPrice ?? 0);

        if (!Number.isFinite(oldBase) || oldBase <= 0) {
          skippedClientItems += 1;
          continue;
        }
        if (!Number.isFinite(newBase) || newBase <= 0) {
          skippedClientItems += 1;
          continue;
        }
        if (!Number.isFinite(current) || current <= 0) {
          skippedClientItems += 1;
          continue;
        }

        const ratio = current / oldBase;
        if (!Number.isFinite(ratio) || ratio <= 0) {
          skippedClientItems += 1;
          continue;
        }

        const nextUnitPrice = Number((newBase * ratio).toFixed(6));
        await tx.clientItem.update({ where: { id: ci.id }, data: { unitPrice: nextUnitPrice } });
        updatedClientItems += 1;
      }

      return { upserted: records.length, updatedClientItems, skippedClientItems };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

