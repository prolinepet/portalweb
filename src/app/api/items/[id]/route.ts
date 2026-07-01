import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';

async function hasUserInventoryItemPriceTable(): Promise<boolean> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ exists_count: bigint | number }>>(
      `SELECT COUNT(*) AS exists_count
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'userinventoryitemprice'`
    );
    const count = Number(rows?.[0]?.exists_count ?? 0);
    return Number.isFinite(count) && count > 0;
  } catch {
    return false;
  }
}

// GET: retorna item por ID
export async function GET(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const id = Number(params.id);
  if (!id || Number.isNaN(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  const item = await prisma.inventoryItem.findUnique({ where: { id } });
  return NextResponse.json(item);
}

// PATCH: atualiza campos básicos do item
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = Number(params.id);
    if (!id || Number.isNaN(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    const body = await request.json();
    const data: any = {};
    if (body.name !== undefined) data.name = String(body.name || '').trim();
    if (body.sku !== undefined) data.sku = String(body.sku || '').trim();
    if (body.unit !== undefined) data.unit = String(body.unit || '').trim();
    if (body.unitWeightKg !== undefined) {
      const raw = String(body.unitWeightKg ?? '').trim();
      const n = raw === '' ? NaN : Number(raw.replace(',', '.'));
      data.unitWeightKg = Number.isFinite(n) ? n : null;
    }
    if (body.thumbnailBase64 !== undefined || body.thumbnailMime !== undefined) {
      const mime = body.thumbnailMime == null ? null : String(body.thumbnailMime || '').trim();
      const b64 = body.thumbnailBase64 == null ? null : String(body.thumbnailBase64 || '').trim();
      if (!mime || !b64) {
        data.thumbnailMime = null;
        data.thumbnailBase64 = null;
      } else {
        data.thumbnailMime = mime;
        data.thumbnailBase64 = b64;
      }
    }
    if (body.commercialFamilyId !== undefined) {
      const cfid = Number(body.commercialFamilyId);
      if (Number.isFinite(cfid) && cfid > 0) {
        const exists = await prisma.commercialFamily.findUnique({ where: { id: cfid } });
        data.commercialFamilyId = exists ? cfid : null;
      } else {
        data.commercialFamilyId = null;
      }
    }
    const updated = await prisma.inventoryItem.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

// DELETE: exclui o item por ID
export async function DELETE(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = Number(params.id);
    if (!id || Number.isNaN(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    const hasOrders = await prisma.salesOrderItem.findFirst({
      where: { inventoryItemId: id },
      select: { id: true },
    });
    if (hasOrders) {
      return NextResponse.json({ error: 'Não é possível excluir: item possui pedido(s) vinculado(s).' }, { status: 409 });
    }

    const hasUserPriceTable = await hasUserInventoryItemPriceTable();

    await prisma.$transaction(async (tx) => {
      await tx.entityModuleItem.deleteMany({ where: { inventoryItemId: id } });
      await tx.clientItem.deleteMany({ where: { inventoryItemId: id } });
      await tx.clientCartItem.deleteMany({ where: { inventoryItemId: id } });
      await tx.priceTableItem.deleteMany({ where: { inventoryItemId: id } });
      if (hasUserPriceTable) {
        await tx.userInventoryItemPrice.deleteMany({ where: { inventoryItemId: id } });
      }
      await tx.inventoryItem.delete({ where: { id } });
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
