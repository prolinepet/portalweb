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

async function ensurePreCargaItemLinkTable(): Promise<void> {
  const g = global as any;
  if (g.__logisticPreCargaItemLinkEnsured) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`logisticprecargaitem\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`preCargaId\` INT NOT NULL,
        \`salesOrderItemId\` INT NOT NULL,
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`ux_logisticprecargaitem_salesorderitem\` (\`salesOrderItemId\`),
        KEY \`idx_logisticprecargaitem_precarga\` (\`preCargaId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } catch {}
  g.__logisticPreCargaItemLinkEnsured = true;
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
  if (k === 'EXPEDIDO') return 8;
  return 0;
}

export async function GET(request: Request) {
  try {
    await ensureSalesOrderItemSdoPedColumn();
    await ensureEntityCodEstabColumn();
    await ensurePreCargaItemLinkTable();

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

    const allItemIds = integratedOrders
      .flatMap((o) => o.items || [])
      .map((it) => Number(it.id))
      .filter((n) => Number.isFinite(n) && n > 0);

    const linkByItemId = new Map<number, number>();
    if (allItemIds.length > 0) {
      const inList = Array.from(new Set(allItemIds)).join(',');
      const rows: any[] = await prisma.$queryRawUnsafe(
        `SELECT salesOrderItemId, preCargaId FROM logisticprecargaitem WHERE salesOrderItemId IN (${inList})`
      );
      for (const r of rows || []) {
        const itemId = Number((r as any)?.salesOrderItemId);
        const preCargaId = Number((r as any)?.preCargaId);
        if (Number.isFinite(itemId) && itemId > 0 && Number.isFinite(preCargaId) && preCargaId > 0) {
          linkByItemId.set(itemId, preCargaId);
        }
      }
    }

    const items = integratedOrders.flatMap((o) => {
      const customerLabel = o.client?.abbrevName || o.customerName || o.client?.name || '';
      const customerCity = o.client?.cidade || null;
      const customerUf = o.client?.estado || null;
      const estab = o.entity?.codEstab || null;
      const kind = o.orderType?.kind ?? null;
      const clientId = o.client?.id ?? null;

      return (o.items || []).map((it) => {
        const dtEntrCli = it.itemDeliveryDate ?? o.deliveryDate ?? null;
        const sdoPed = Number(it.sdoPed ?? 0);
        const sdoEst = Number((it as any)?.inventoryItem?.quantity ?? 0);
        const qtdProg = 0;
        const diverg = sdoPed - qtdProg;

        return {
          itemId: it.id,
          salesOrderId: o.id,
          clientId,
          preCargaId: linkByItemId.get(Number(it.id)) ?? null,
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

export async function POST(request: Request) {
  try {
    await ensurePreCargaItemLinkTable();

    const session = await getServerSession(authOptions);
    const uid = session?.user ? Number((session.user as any).id) : undefined;
    const entityId = (session as any)?.entityId ?? (session as any)?.activeEntityId ?? null;
    if (!uid) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const allowed = await isProgramAllowed(uid, entityId, 'PAINEL_LOGISTICO');
    if (!allowed) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const preCargaId = Number(body?.preCargaId);
    const itemIds = Array.isArray(body?.itemIds) ? body.itemIds : [];
    if (!Number.isFinite(preCargaId) || preCargaId <= 0) return NextResponse.json({ error: 'preCargaId inválido' }, { status: 400 });

    const normalizedItemIds = Array.from(
      new Set(
        itemIds
          .map((x: any) => Number(x))
          .filter((n: number) => Number.isFinite(n) && n > 0)
      )
    );
    if (normalizedItemIds.length === 0) return NextResponse.json({ ok: true, linked: 0, skipped: 0 });

    let linked = 0;
    let skipped = 0;

    await prisma.$transaction(async (tx) => {
      for (const itemId of normalizedItemIds) {
        const r = await tx.$executeRawUnsafe(
          `INSERT INTO logisticprecargaitem (preCargaId, salesOrderItemId, createdAt, updatedAt)
           SELECT ${preCargaId}, ${itemId}, NOW(), NOW()
           FROM DUAL
           WHERE NOT EXISTS (SELECT 1 FROM logisticprecargaitem WHERE salesOrderItemId = ${itemId})`
        );
        if (Number(r) > 0) linked += 1;
        else skipped += 1;
      }
    });

    return NextResponse.json({ ok: true, linked, skipped });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensurePreCargaItemLinkTable();

    const session = await getServerSession(authOptions);
    const uid = session?.user ? Number((session.user as any).id) : undefined;
    const entityId = (session as any)?.entityId ?? (session as any)?.activeEntityId ?? null;
    if (!uid) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const allowed = await isProgramAllowed(uid, entityId, 'PAINEL_LOGISTICO');
    if (!allowed) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const preCargaId = Number(body?.preCargaId);
    const itemId = Number(body?.itemId);
    if (!Number.isFinite(preCargaId) || preCargaId <= 0) return NextResponse.json({ error: 'preCargaId inválido' }, { status: 400 });
    if (!Number.isFinite(itemId) || itemId <= 0) return NextResponse.json({ error: 'itemId inválido' }, { status: 400 });

    const deleted = await prisma.$executeRawUnsafe(
      `DELETE FROM logisticprecargaitem WHERE preCargaId = ${preCargaId} AND salesOrderItemId = ${itemId}`
    );
    return NextResponse.json({ ok: true, deleted: Number(deleted) || 0 });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
