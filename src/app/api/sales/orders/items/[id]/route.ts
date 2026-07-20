import { NextResponse } from 'next/server';
import { prisma } from '../../../../../../lib/prisma';

async function ensureSalesOrderItemSdoPedColumn(): Promise<void> {
  const g = global as any;
  if (g.__salesOrderItemSdoPedEnsured) return;
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE `salesorderitem` ADD COLUMN `sdoPed` FLOAT NOT NULL DEFAULT 0');
  } catch {}
  g.__salesOrderItemSdoPedEnsured = true;
}

function parseIdParam(raw: unknown): number | null {
  const s = String(raw ?? '').trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

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

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await ensureSalesOrderItemSdoPedColumn();
    const id = parseIdParam(params.id);
    if (!id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    const item = await prisma.salesOrderItem.findUnique({
      where: { id },
      include: { inventoryItem: true }
    });
    if (!item) return NextResponse.json({ error: 'Item não encontrado' }, { status: 404 });
    return NextResponse.json(item);
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await ensureSalesOrderItemSdoPedColumn();
    const id = parseIdParam(params.id);
    if (!id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    const body = await request.json();
    const allowed: Record<string, any> = {};
    if (body.quantity !== undefined) allowed.quantity = Number(body.quantity);
    if (body.width !== undefined) allowed.width = Number(body.width);
    if (body.length !== undefined) allowed.length = Number(body.length);
    if (body.grammage !== undefined) allowed.grammage = Number(body.grammage);
    if (body.diameter !== undefined) allowed.diameter = Number(body.diameter);
    if (body.tube !== undefined) allowed.tube = Number(body.tube);
    if (body.discountPct !== undefined) allowed.discountPct = Number(body.discountPct);
    if (body.discountValue !== undefined) allowed.discountValue = Number(body.discountValue);
    if (body.unitPrice !== undefined) allowed.unitPrice = Number(body.unitPrice);
    if (body.clientOrderNumber !== undefined) allowed.clientOrderNumber = String(body.clientOrderNumber);
    if (body.clientOrderItemNumber !== undefined) allowed.clientOrderItemNumber = Number(body.clientOrderItemNumber);
    if (body.itemDeliveryDate !== undefined) allowed.itemDeliveryDate = body.itemDeliveryDate ? new Date(body.itemDeliveryDate) : null;
    if (body.internalResin !== undefined) allowed.internalResin = Boolean(body.internalResin);
    if (body.externalResin !== undefined) allowed.externalResin = Boolean(body.externalResin);
    if (body.creases !== undefined) allowed.creases = body.creases;

    const keys = Object.keys(allowed);
    if (keys.length === 0) return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 });

    const updated = await prisma.$transaction(async (tx) => {
      const after = await tx.salesOrderItem.update({
        where: { id },
        data: allowed,
      });
      const orderId = Number(after.orderId);

      const remainingItems = await tx.salesOrderItem.findMany({
        where: { orderId },
      });
      const invIds = remainingItems
        .map((it) => (it.inventoryItemId ? Number(it.inventoryItemId) : null))
        .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0);

      const invInfoMap = new Map<number, { priceBy: string | null; unitWeightKg: number | null; commercialFamilyId: number | null }>();
      if (invIds.length > 0) {
        const unique = Array.from(new Set(invIds));
        const invs = await tx.inventoryItem.findMany({
          where: { id: { in: unique } },
          select: {
            id: true,
            unitWeightKg: true,
            commercialFamilyId: true,
            commercialFamily: { select: { priceBy: true } },
          },
        });
        for (const inv of invs) {
          invInfoMap.set(inv.id, {
            priceBy: inv.commercialFamily?.priceBy != null ? String(inv.commercialFamily.priceBy) : null,
            unitWeightKg: inv.unitWeightKg != null ? Number(inv.unitWeightKg) : null,
            commercialFamilyId: inv.commercialFamilyId != null ? Number(inv.commercialFamilyId) : null,
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

      await tx.salesOrder.update({
        where: { id: orderId },
        data: { subtotal, discountTotal, total },
      });

      const saved = await tx.salesOrderItem.findUnique({ where: { id } });
      const invId = saved?.inventoryItemId ? Number(saved.inventoryItemId) : null;
      const commercialFamilyId = invId ? (invInfoMap.get(invId)?.commercialFamilyId ?? null) : null;
      return saved ? { ...saved, commercialFamilyId } : { ...after, commercialFamilyId };
    });
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await ensureSalesOrderItemSdoPedColumn();
    const id = parseIdParam(params.id);
    if (!id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

    await prisma.$transaction(async (tx) => {
      const item = await tx.salesOrderItem.findUnique({
        where: { id },
        select: { orderId: true }
      });

      if (!item) {
        throw new Error('Item não encontrado');
      }

      await tx.salesOrderItem.delete({
        where: { id }
      });

      // Recalcular totais do pedido
      const remainingItems = await tx.salesOrderItem.findMany({
        where: { orderId: item.orderId }
      });

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

      await tx.salesOrder.update({
        where: { id: item.orderId },
        data: {
          subtotal,
          discountTotal,
          total
        }
      });
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Erro ao excluir item:', err);
    const status = err.message === 'Item não encontrado' ? 404 : 500;
    return NextResponse.json({ error: String(err?.message || err) }, { status });
  }
}
