import { NextResponse } from 'next/server';
import { prisma } from '../../../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../../lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const clientId = Number(params.id);
  if (!Number.isFinite(clientId) || clientId <= 0) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const rows = await prisma.clientItemStock.findMany({
    where: { clientId },
    orderBy: [{ sku: 'asc' }, { lotSerie: 'asc' }],
    select: { sku: true, lotSerie: true, qtyCurrent: true, qtyAvailable: true },
  });

  const skus = Array.from(new Set(rows.map((r) => String(r.sku || '').trim()).filter(Boolean)));
  const items = skus.length
    ? await prisma.inventoryItem.findMany({
        where: { sku: { in: skus } },
        select: { sku: true, name: true },
      })
    : [];

  const descBySku = new Map<string, string>();
  for (const it of items) {
    const sku = String(it.sku || '').trim();
    if (!sku) continue;
    descBySku.set(sku, it.name);
  }

  return NextResponse.json(
    rows.map((r) => {
      const sku = String(r.sku || '').trim();
      return {
        sku,
        description: descBySku.get(sku) ?? null,
        lotSerie: r.lotSerie ? r.lotSerie : null,
        qtyCurrent: r.qtyCurrent ?? 0,
        qtyAvailable: r.qtyAvailable ?? 0,
      };
    }),
  );
}
