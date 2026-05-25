import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../../lib/auth';
import { prisma } from '../../../../../../lib/prisma';
import { isProgramAllowed } from '../../../../../../lib/isProgramAllowed';

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

function parseId(raw: unknown): number | null {
  const s = String(raw ?? '').trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function parseDateOnly(raw: unknown): Date | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await ensurePreCargaTable();
    const session = await getServerSession(authOptions);
    const uid = session?.user ? Number((session.user as any).id) : undefined;
    const entityId = (session as any)?.entityId ?? (session as any)?.activeEntityId ?? null;
    if (!uid) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const allowed = await isProgramAllowed(uid, entityId, 'PAINEL_LOGISTICO');
    if (!allowed) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    if (!entityId) return NextResponse.json({ error: 'Entidade não selecionada' }, { status: 400 });

    const id = parseId(params.id);
    if (!id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

    const existing = await prisma.logisticPreCarga.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Pré-carga não encontrada' }, { status: 404 });
    if (Number(existing.entityId) !== Number(entityId)) return NextResponse.json({ error: 'Pré-carga inválida' }, { status: 404 });

    const body = await request.json();
    const dtPrevCarreg = parseDateOnly(body?.dtPrevCarreg);
    const cifFobRaw = String(body?.cifFob || '').trim().toUpperCase();
    const cifFob = cifFobRaw === 'CIF' || cifFobRaw === 'FOB' ? cifFobRaw : '';

    if (!dtPrevCarreg) return NextResponse.json({ error: 'Dt Prev Carreg obrigatória' }, { status: 400 });
    if (!cifFob) return NextResponse.json({ error: 'CIF/FOB obrigatório' }, { status: 400 });

    const updated = await prisma.logisticPreCarga.update({
      where: { id },
      data: { dtPrevCarreg, cifFob },
    });
    return NextResponse.json({ ok: true, preCarga: updated });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await ensurePreCargaTable();
    const session = await getServerSession(authOptions);
    const uid = session?.user ? Number((session.user as any).id) : undefined;
    const entityId = (session as any)?.entityId ?? (session as any)?.activeEntityId ?? null;
    if (!uid) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const allowed = await isProgramAllowed(uid, entityId, 'PAINEL_LOGISTICO');
    if (!allowed) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    if (!entityId) return NextResponse.json({ error: 'Entidade não selecionada' }, { status: 400 });

    const id = parseId(params.id);
    if (!id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

    const existing = await prisma.logisticPreCarga.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ ok: true, deletedId: id });
    if (Number(existing.entityId) !== Number(entityId)) return NextResponse.json({ error: 'Pré-carga inválida' }, { status: 404 });

    await prisma.logisticPreCarga.delete({ where: { id } });
    return NextResponse.json({ ok: true, deletedId: id });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

