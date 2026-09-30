import { NextResponse } from 'next/server';
import { prisma } from '../../../../../../lib/prisma';
import { includesAnySearchText } from '../../../../../../lib/text-search';

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const repUserId = Number(params.id);
    if (!Number.isFinite(repUserId) || repUserId <= 0) return NextResponse.json([]);

    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim();
    const takeRaw = Number(url.searchParams.get('take') || 1000);
    const take = Number.isFinite(takeRaw) ? Math.min(2000, Math.max(1, takeRaw)) : 1000;

    const rows = await prisma.userInventoryItemPrice.findMany({
      where: { userId: repUserId },
      select: {
        inventoryItemId: true,
        unit: true,
        unitPrice: true,
        inventoryItem: { select: { sku: true, name: true } },
      },
      orderBy: [{ inventoryItemId: 'asc' }, { unit: 'asc' }],
      take,
    });

    const normalizedRows = rows.map((r) => ({
      inventoryItemId: r.inventoryItemId,
      sku: r.inventoryItem?.sku ?? null,
      name: r.inventoryItem?.name ?? null,
      unit: r.unit,
      unitPrice: r.unitPrice,
    }));

    return NextResponse.json(
      q ? normalizedRows.filter((row) => includesAnySearchText([row.name, row.sku], q)) : normalizedRows
    );
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
