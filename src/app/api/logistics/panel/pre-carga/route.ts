import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/prisma';
import { isProgramAllowed } from '../../../../../lib/isProgramAllowed';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function ensurePreCargaTable(): Promise<void> {
  const g = global as any;
  if (g.__logisticsPreCargaEnsured) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`logisticprecarga\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`entityId\` INT NOT NULL,
        \`dtPrevCarreg\` DATETIME NULL,
        \`cifFob\` CHAR(3) NULL,
        \`isFinalized\` TINYINT(1) NOT NULL DEFAULT 0,
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        INDEX \`idx_logisticprecarga_entity_final_dt\` (\`entityId\`, \`isFinalized\`, \`dtPrevCarreg\`),
        CONSTRAINT \`fk_logisticprecarga_entity\` FOREIGN KEY (\`entityId\`) REFERENCES \`entity\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } catch {}
  g.__logisticsPreCargaEnsured = true;
}

function parseDateOnly(raw: unknown): Date | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function GET(request: Request) {
  try {
    await ensurePreCargaTable();
    const session = await getServerSession(authOptions);
    const uid = session?.user ? Number((session.user as any).id) : undefined;
    const entityId = (session as any)?.entityId ?? (session as any)?.activeEntityId ?? null;
    if (!uid) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const allowed = await isProgramAllowed(uid, entityId, 'PAINEL_LOGISTICO');
    if (!allowed) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    if (!entityId) return NextResponse.json({ preCargas: [] });

    const url = new URL(request.url);
    const includeFinalized = (url.searchParams.get('includeFinalized') || '').trim() === '1';

    const preCargas = await prisma.logisticPreCarga.findMany({
      where: {
        entityId: Number(entityId),
        ...(includeFinalized ? {} : { isFinalized: false }),
      },
      orderBy: [{ id: 'desc' }],
      take: 200,
    });

    const res = NextResponse.json({ preCargas });
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res;
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensurePreCargaTable();
    const session = await getServerSession(authOptions);
    const uid = session?.user ? Number((session.user as any).id) : undefined;
    const entityId = (session as any)?.entityId ?? (session as any)?.activeEntityId ?? null;
    if (!uid) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const allowed = await isProgramAllowed(uid, entityId, 'PAINEL_LOGISTICO');
    if (!allowed) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    if (!entityId) return NextResponse.json({ error: 'Entidade não selecionada' }, { status: 400 });

    const body = await request.json();
    const dtPrevCarreg = parseDateOnly(body?.dtPrevCarreg);
    const cifFobRaw = String(body?.cifFob || '').trim().toUpperCase();
    const cifFob = cifFobRaw === 'CIF' || cifFobRaw === 'FOB' ? cifFobRaw : '';

    if (!dtPrevCarreg) return NextResponse.json({ error: 'Dt Prev Carreg obrigatória' }, { status: 400 });
    if (!cifFob) return NextResponse.json({ error: 'CIF/FOB obrigatório' }, { status: 400 });

    const created = await prisma.logisticPreCarga.create({
      data: {
        entityId: Number(entityId),
        dtPrevCarreg,
        cifFob,
        isFinalized: false,
      },
    });
    return NextResponse.json({ ok: true, preCarga: created });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

