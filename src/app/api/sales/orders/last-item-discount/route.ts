import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';

function parsePositiveInt(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user ? Number((session.user as any).id) : null;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(request.url);
    const clientId = parsePositiveInt(url.searchParams.get('clientId'));
    const inventoryItemId = parsePositiveInt(url.searchParams.get('inventoryItemId'));

    if (!clientId) return NextResponse.json({ error: 'clientId obrigatório' }, { status: 400 });
    if (!inventoryItemId) return NextResponse.json({ error: 'inventoryItemId obrigatório' }, { status: 400 });

    const row = await prisma.salesOrderItem.findFirst({
      where: {
        inventoryItemId,
        order: { clientId },
      },
      orderBy: {
        order: { createdAt: 'desc' },
      },
      select: {
        discountPct: true,
        discountValue: true,
      },
    });

    return NextResponse.json({
      discountPct: Number(row?.discountPct ?? 0) || 0,
      discountValue: Number(row?.discountValue ?? 0) || 0,
    });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
