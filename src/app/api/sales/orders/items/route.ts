import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

function computeWeightKg(it: { width?: number | null; length?: number | null; grammage?: number | null; quantity?: number | null }, unitWeightKg?: number | null): number {
  const q = Number(it.quantity ?? 0);
  const uw = Number(unitWeightKg ?? 0);
  if (Number.isFinite(uw) && uw > 0 && Number.isFinite(q) && q > 0) return uw * q;

  const w = Number(it.width ?? 0);
  const l = Number(it.length ?? 0);
  const g = Number(it.grammage ?? 0);
  if (w > 0 && l > 0 && g > 0 && q > 0) {
    const areaM2 = (l / 1000) * (w / 1000);
    const weightKg = (areaM2 * g * q) / 1000;
    return weightKg;
  }
  return 0;
}

function lineBase(
  it: { quantity?: number | null; unitPrice?: number | null; width?: number | null; length?: number | null; grammage?: number | null },
  priceBy?: string | null,
  unitWeightKg?: number | null
): number {
  const qty = Number(it.quantity ?? 0);
  const price = Number(it.unitPrice ?? 0);
  const pb = String(priceBy || '').trim().toUpperCase();
  if (pb === 'WEIGHT' || pb === 'PESO') return computeWeightKg(it, unitWeightKg) * price;
  return qty * price;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const orderId = Number(body.orderId);
    if (!Number.isFinite(orderId) || orderId <= 0) return NextResponse.json({ error: 'orderId obrigatório' }, { status: 400 });

    const payload: Record<string, any> = {};
    if (body.inventoryItemId !== undefined) payload.inventoryItemId = Number(body.inventoryItemId) || null;
    if (body.sku !== undefined) payload.sku = String(body.sku || '').trim() || null;
    payload.name = String(body.name || 'Produto');
    payload.quantity = Number(body.quantity || 1);
    payload.unit = body.unit ? String(body.unit) : null;
    payload.unitPrice = Number(body.unitPrice || 0);
    payload.discountPct = Number(body.discountPct || 0);
    payload.discountValue = Number(body.discountValue || 0);
    if (body.width !== undefined) payload.width = Number(body.width || 0);
    if (body.length !== undefined) payload.length = Number(body.length || 0);
    if (body.grammage !== undefined) payload.grammage = Number(body.grammage || 0);
    if (body.diameter !== undefined) payload.diameter = Number(body.diameter || 0);
    if (body.tube !== undefined) payload.tube = Number(body.tube || 0);

    let priceBy: string | null = null;
    let unitWeightKg: number | null = null;
    if (payload.inventoryItemId) {
      const invItem = await prisma.inventoryItem.findUnique({
        where: { id: payload.inventoryItemId },
        select: {
          width: true,
          length: true,
          grammage: true,
          unitWeightKg: true,
          commercialFamily: { select: { priceBy: true } },
        },
      });
      if (invItem) {
        if (payload.width === undefined) payload.width = invItem.width;
        if (payload.length === undefined) payload.length = invItem.length;
        if (payload.grammage === undefined) payload.grammage = invItem.grammage;
        priceBy = invItem.commercialFamily?.priceBy != null ? String(invItem.commercialFamily.priceBy) : null;
        unitWeightKg = invItem.unitWeightKg != null ? Number(invItem.unitWeightKg) : null;
      }
    }

    const base = lineBase(payload, priceBy, unitWeightKg);
    const pb = String(priceBy || '').trim().toUpperCase();
    const unitFactor = pb === 'WEIGHT' || pb === 'PESO' ? computeWeightKg(payload, unitWeightKg) : Number(payload.quantity ?? 0);
    const lineDiscount = base * (Number(payload.discountPct ?? 0) / 100) + unitFactor * Number(payload.discountValue ?? 0);
    payload.lineTotal = Math.max(0, base - lineDiscount);

    const created = await prisma.$transaction(async (tx) => {
      const item = await tx.salesOrderItem.create({
        data: {
          orderId,
          inventoryItemId: payload.inventoryItemId ?? null,
          sku: payload.sku ?? null,
          name: payload.name,
          quantity: payload.quantity,
          unit: payload.unit ?? null,
          unitPrice: payload.unitPrice,
          discountPct: payload.discountPct,
          discountValue: payload.discountValue,
          lineTotal: payload.lineTotal,
          width: payload.width ?? null,
          length: payload.length ?? null,
          grammage: payload.grammage ?? null,
          diameter: payload.diameter ?? null,
          tube: payload.tube ?? null,
        },
      });

      const remainingItems = await tx.salesOrderItem.findMany({ where: { orderId } });
      const invIds = remainingItems
        .map((it) => (it.inventoryItemId ? Number(it.inventoryItemId) : null))
        .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0);

      const invInfoMap = new Map<number, { priceBy: string | null; unitWeightKg: number | null }>();
      if (invIds.length > 0) {
        const unique = Array.from(new Set(invIds));
        const invs = await tx.inventoryItem.findMany({
          where: { id: { in: unique } },
          select: {
            id: true,
            unitWeightKg: true,
            commercialFamily: { select: { priceBy: true } },
          },
        });
        for (const inv of invs) {
          invInfoMap.set(inv.id, {
            priceBy: inv.commercialFamily?.priceBy != null ? String(inv.commercialFamily.priceBy) : null,
            unitWeightKg: inv.unitWeightKg != null ? Number(inv.unitWeightKg) : null,
          });
        }
      }

      for (const it of remainingItems) {
        const info = it.inventoryItemId ? invInfoMap.get(Number(it.inventoryItemId)) : undefined;
        const pb = info?.priceBy ?? null;
        const uw = info?.unitWeightKg ?? null;
        const base = lineBase(it, pb, uw);
        const pbNorm = String(pb || '').trim().toUpperCase();
        const unitFactor = pbNorm === 'WEIGHT' || pbNorm === 'PESO' ? computeWeightKg(it, uw) : Number(it.quantity ?? 0);
        const lineDiscount = base * (Number(it.discountPct ?? 0) / 100) + unitFactor * Number(it.discountValue ?? 0);
        const computedLineTotal = Math.max(0, base - lineDiscount);
        if (Number(it.lineTotal ?? 0) !== computedLineTotal) {
          await tx.salesOrderItem.update({ where: { id: it.id }, data: { lineTotal: computedLineTotal } });
        }
      }

      const subtotal = remainingItems.reduce((acc, it) => {
        const info = it.inventoryItemId ? invInfoMap.get(Number(it.inventoryItemId)) : undefined;
        return acc + lineBase(it, info?.priceBy ?? null, info?.unitWeightKg ?? null);
      }, 0);
      const discountTotal = remainingItems.reduce((acc, it) => {
        const info = it.inventoryItemId ? invInfoMap.get(Number(it.inventoryItemId)) : undefined;
        const pbNorm = String(info?.priceBy || '').trim().toUpperCase();
        const base = lineBase(it, info?.priceBy ?? null, info?.unitWeightKg ?? null);
        const unitFactor = pbNorm === 'WEIGHT' || pbNorm === 'PESO' ? computeWeightKg(it, info?.unitWeightKg ?? null) : Number(it.quantity ?? 0);
        return acc + (base * (Number(it.discountPct ?? 0) / 100) + unitFactor * Number(it.discountValue ?? 0));
      }, 0);
      const total = subtotal - discountTotal;

      await tx.salesOrder.update({ where: { id: orderId }, data: { subtotal, discountTotal, total } });
      return item;
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
