import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../../lib/auth';
import { prisma } from '../../../../../../lib/prisma';
import { isProgramAllowed } from '../../../../../../lib/isProgramAllowed';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function ensureSalesOrderItemSdoPedColumn(): Promise<void> {
  const g = global as any;
  if (g.__salesOrderItemSdoPedEnsured) return;
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE `salesorderitem` ADD COLUMN `sdoPed` FLOAT NOT NULL DEFAULT 0');
  } catch {}
  g.__salesOrderItemSdoPedEnsured = true;
}

async function ensureEntityCodEstabColumn(): Promise<void> {
  const g = global as any;
  if (g.__entityCodEstabEnsured) return;
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE `entity` ADD COLUMN `codEstab` CHAR(5) NULL');
  } catch {}
  g.__entityCodEstabEnsured = true;
}

function normalizeStatusKey(status: unknown): string {
  const s = String(status || '').trim().toUpperCase();
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function statusRank(status: unknown): number {
  const k = normalizeStatusKey(status);
  if (!k) return 0;
  if (k === 'CANCELADO') return -1;
  if (k === 'OPEN' || k === 'ORCAMENTO') return 0;
  if (k === 'AGUARDANDO INTEGRACAO') return 1;
  if (k === 'ERRO NA INTEGRACAO' || k === 'ERRO NA INTEGRACAO ') return 2;
  if (k === 'INTEGRADO') return 3;
  if (k === 'EM FILA PRODUCAO') return 4;
  if (k === 'EM PRODUCAO') return 5;
  if (k === 'PRODUZIDO/ESTOCADO') return 6;
  if (k === 'FATURADO') return 7;
  return 0;
}

export async function GET(request: Request) {
  try {
    await ensureSalesOrderItemSdoPedColumn();
    await ensureEntityCodEstabColumn();

    const session = await getServerSession(authOptions);
    const uid = session?.user ? Number((session.user as any).id) : undefined;
    const entityId = (session as any)?.entityId ?? (session as any)?.activeEntityId ?? null;
    if (!uid) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const allowed = await isProgramAllowed(uid, entityId, 'PAINEL_LOGISTICO');
    if (!allowed) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

    const url = new URL(request.url);
    const dateStartRaw = url.searchParams.get('dateStart');
    const dateEndRaw = url.searchParams.get('dateEnd');
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();

    const dateStart = dateStartRaw ? new Date(`${dateStartRaw}T00:00:00`) : null;
    const dateEnd = dateEndRaw ? new Date(`${dateEndRaw}T23:59:59`) : null;

    const where: any = {};
    if (entityId) where.entityId = Number(entityId);
    if (dateStart || dateEnd) {
      where.createdAt = {};
      if (dateStart) where.createdAt.gte = dateStart;
      if (dateEnd) where.createdAt.lte = dateEnd;
    }
    where.NOT = { status: { equals: 'CANCELADO' } };

    const orders = await prisma.salesOrder.findMany({
      where,
      select: {
        id: true,
        code: true,
        status: true,
        createdAt: true,
        deliveryDate: true,
        customerName: true,
        customerDoc: true,
        entity: { select: { id: true, name: true, codEstab: true } },
        client: { select: { id: true, clientCode: true, abbrevName: true, name: true, cidade: true, estado: true } },
        orderType: { select: { id: true, codtipoped: true, descricao: true, kind: true } },
        items: {
          select: {
            id: true,
            inventoryItemId: true,
            sku: true,
            name: true,
            quantity: true,
            unit: true,
            sdoPed: true,
            clientOrderNumber: true,
            clientOrderItemNumber: true,
            itemDeliveryDate: true,
            inventoryItem: { select: { quantity: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const integratedOrders = orders.filter((o) => statusRank(o.status) >= 3);
    const items = integratedOrders.flatMap((o) => {
      const customerLabel = o.client?.abbrevName || o.customerName || o.client?.name || '';
      const customerCity = o.client?.cidade || null;
      const customerUf = o.client?.estado || null;
      const estab = o.entity?.codEstab || null;
      const kind = o.orderType?.kind ?? null;

      return (o.items || []).map((it) => {
        const dtEntrCli = it.itemDeliveryDate ?? o.deliveryDate ?? null;
        const sdoPed = Number(it.sdoPed ?? 0);
        const sdoEst = Number((it as any)?.inventoryItem?.quantity ?? 0);
        const qtdProg = 0;
        const diverg = sdoPed - qtdProg;

        return {
          uf: customerUf,
          cidade: customerCity,
          dtEntrCli,
          cliente: customerLabel,
          estab,
          pedCli: it.clientOrderNumber ?? null,
          aprovacao: 'Sim',
          seq: it.clientOrderItemNumber ?? null,
          codItem: it.sku ?? null,
          sdoPed,
          sdoEst,
          qtdProg,
          diverg,
          descricao: it.name,
          orderTypeKind: kind,
        };
      });
    });

    const filtered = q
      ? items.filter((r) => {
          const hay = `${r.estab ?? ''} ${r.uf ?? ''} ${r.cidade ?? ''} ${r.cliente ?? ''} ${r.pedCli ?? ''} ${r.codItem ?? ''} ${r.descricao ?? ''}`.toLowerCase();
          return hay.includes(q);
        })
      : items;

    const res = NextResponse.json({ items: filtered });
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res;
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
