import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';

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
    await prisma.inventoryItem.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
