import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

function normalizeDoc(doc: unknown): string {
  return String(doc || '').replace(/\D+/g, '');
}

function toInt(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(String(v || '').trim());
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function normalizeMonth(v: unknown): number {
  const n = toInt(v);
  if (!n) return 0;
  if (n < 1 || n > 12) return 0;
  return n;
}

async function resolveEntityIdFromDoc(docRaw: unknown): Promise<number | null> {
  const doc = normalizeDoc(docRaw);
  if (!doc) return null;

  const direct = await prisma.entity.findFirst({ where: { cnpj: doc }, select: { id: true } }).catch(() => null);
  if (direct?.id) return Number(direct.id);

  const candidates = await prisma.entity.findMany({ select: { id: true, cnpj: true } }).catch(() => []);
  const match = (candidates || []).find((e: any) => normalizeDoc(String(e?.cnpj || '')) === doc);
  return match?.id ? Number(match.id) : null;
}

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null as any);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Body inválido' }, { status: 400 });

    const yearRaw = toInt((body as any).year);
    const year = yearRaw && yearRaw >= 2000 && yearRaw <= 2100 ? yearRaw : null;
    if (!year) return NextResponse.json({ error: 'year inválido' }, { status: 400 });

    const month = normalizeMonth((body as any).month);

    const entityDoc = normalizeDoc((body as any)?.entity?.doc ?? (body as any)?.entityDoc ?? (body as any)?.cnpj);
    if (!entityDoc) return NextResponse.json({ error: 'entity.doc (CNPJ) ausente' }, { status: 400 });

    const entityId = await resolveEntityIdFromDoc(entityDoc);
    if (!entityId) return NextResponse.json({ error: 'Entidade não encontrada' }, { status: 404 });

    const created = await prisma.salesDashboardSnapshot.upsert({
      where: { entityId_year_month: { entityId: Math.trunc(entityId), year, month } },
      create: {
        entityId: Math.trunc(entityId),
        year,
        month,
        payload: body as any,
      },
      update: {
        payload: body as any,
      },
      select: { id: true, entityId: true, year: true, month: true, updatedAt: true },
    });

    return NextResponse.json({ ok: true, snapshot: created });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
