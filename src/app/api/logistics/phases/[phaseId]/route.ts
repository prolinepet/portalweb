import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import { isProgramAllowed } from '../../../../../lib/isProgramAllowed';

async function ensureAllowed(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  const userId = session?.user ? Number((session.user as any).id) : NaN;
  const entityIdRaw = (session as any)?.activeEntityId ?? (session as any)?.entityId ?? (session?.user as any)?.lastEntityId ?? null;
  const entityId = entityIdRaw == null ? NaN : Number(entityIdRaw);
  if (!Number.isFinite(userId) || userId <= 0) return false;
  if (!Number.isFinite(entityId) || entityId <= 0) return false;
  return await isProgramAllowed(userId, entityId, 'PROCESSOS_LOGISTICOS').catch(() => false);
}

export async function PUT(req: Request, { params }: { params: { phaseId: string } }) {
  try {
    const allowed = await ensureAllowed();
    if (!allowed) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

    const id = Number(params.phaseId);
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: 'Fase inválida' }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));
    const code = Number(body?.code);
    const description = String(body?.description || '').trim();
    const isAuto = Boolean(body?.isAuto);
    const isCarga = Boolean(body?.isCarga);
    const isDescarga = Boolean(body?.isDescarga);

    if (!Number.isFinite(code) || code <= 0) return NextResponse.json({ error: 'Cód Fase inválido' }, { status: 400 });
    if (!description) return NextResponse.json({ error: 'Descrição da fase é obrigatória' }, { status: 400 });
    if (!isCarga && !isDescarga) return NextResponse.json({ error: 'Marque Carga e/ou Descarga.' }, { status: 400 });

    const updated = await prisma.logisticProcessPhase.update({
      where: { id: Math.trunc(id) },
      data: { code: Math.trunc(code), description, isAuto, isCarga, isDescarga },
      select: { id: true, processId: true, code: true, description: true, isAuto: true, isCarga: true, isDescarga: true, sequence: true },
    });
    return NextResponse.json(updated);
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate')) {
      return NextResponse.json({ error: 'Já existe uma fase com este código neste processo.' }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { phaseId: string } }) {
  try {
    const allowed = await ensureAllowed();
    if (!allowed) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

    const id = Number(params.phaseId);
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: 'Fase inválida' }, { status: 400 });

    const phase = await prisma.logisticProcessPhase.findUnique({
      where: { id: Math.trunc(id) },
      select: { id: true, processId: true },
    });
    if (!phase) return NextResponse.json({ ok: true });

    await prisma.logisticProcessPhase.delete({ where: { id: Math.trunc(id) } });

    const remaining = await prisma.logisticProcessPhase.findMany({
      where: { processId: Math.trunc(Number(phase.processId)) },
      orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    await prisma.$transaction(
      remaining.map((p, idx) => prisma.logisticProcessPhase.update({ where: { id: p.id }, data: { sequence: idx + 1 } }))
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
