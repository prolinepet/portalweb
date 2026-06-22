import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '../../../../../../lib/prisma';
import { authOptions } from '../../../../../../lib/auth';

function parsePositiveInt(raw: unknown): number | null {
  const s = String(raw ?? '').trim();
  const m = s.match(/^\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

async function ensureAllowed(request: Request): Promise<boolean> {
  const envKey = process.env.ERP_INTEGRATION_KEY || process.env.INTEGRATION_API_KEY || '';
  const headerKey = request.headers.get('x-integration-key') || '';
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (envKey && (headerKey === envKey || bearer === envKey)) return true;

  const session = await getServerSession(authOptions);
  const uid = session?.user ? Number((session.user as any).id) : NaN;
  return Number.isFinite(uid) && uid > 0;
}

async function resolveOrderKey(rawKey: string): Promise<{ id: number; code: string } | null> {
  const key = String(rawKey ?? '').trim();
  if (!key) return null;
  if (!/^[A-Za-z0-9-]+$/.test(key)) return null;

  const numeric = parsePositiveInt(key);
  if (numeric) {
    const byId = await prisma.salesOrder.findUnique({
      where: { id: numeric },
      select: { id: true, code: true },
    });
    if (byId) return { id: byId.id, code: byId.code || key };
  }

  const code = key.toUpperCase();
  if (code.length > 32) return null;
  const byCode = await prisma.salesOrder.findFirst({
    where: { code },
    select: { id: true, code: true },
  });
  if (!byCode) return null;
  return { id: byCode.id, code: byCode.code || code };
}

export async function POST(request: Request) {
  try {
    const allowed = await ensureAllowed(request);
    if (!allowed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({} as any));
    const rawOrderKey = String(body?.orderCode ?? body?.code ?? body?.orderId ?? body?.id ?? '').trim();
    const status = String(body?.status ?? '').trim();
    const messages = Array.isArray(body?.messages) ? body.messages : [];

    if (!rawOrderKey) {
      return NextResponse.json({ error: 'orderCode é obrigatório' }, { status: 400 });
    }
    if (!status) {
      return NextResponse.json({ error: 'status é obrigatório' }, { status: 400 });
    }

    const orderKey = await resolveOrderKey(rawOrderKey);
    if (!orderKey) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    const data: Record<string, any> = { status };
    const normalizedStatus = status.trim().toUpperCase();
    if (normalizedStatus === 'OPEN' || normalizedStatus === 'ORÇAMENTO' || normalizedStatus === 'ORCAMENTO') {
      data.erpOrderNumber = null;
    }

    const updated = await prisma.salesOrder.update({
      where: { id: orderKey.id },
      data,
      select: {
        id: true,
        code: true,
        status: true,
        updatedAt: true,
      },
    });

    await prisma.salesOrderStatusHistory.deleteMany({
      where: { orderId: orderKey.id, status },
    });

    await prisma.salesOrderStatusHistory.create({
      data: {
        orderId: orderKey.id,
        status,
        messages,
      },
    });

    return NextResponse.json({
      ok: true,
      orderId: updated.id,
      orderCode: updated.code,
      status: updated.status,
      updatedAt: updated.updatedAt,
    });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
