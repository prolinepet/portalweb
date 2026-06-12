import { NextResponse } from 'next/server';
import { prisma } from '../../../../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../../../lib/auth';
import { isProgramAllowed } from '../../../../../../../lib/isProgramAllowed';

async function ensureAllowed(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  const userId = session?.user ? Number((session.user as any).id) : NaN;
  const entityIdRaw = (session as any)?.activeEntityId ?? (session as any)?.entityId ?? (session?.user as any)?.lastEntityId ?? null;
  const entityId = entityIdRaw == null ? NaN : Number(entityIdRaw);
  if (!Number.isFinite(userId) || userId <= 0) return false;
  if (!Number.isFinite(entityId) || entityId <= 0) return false;
  return await isProgramAllowed(userId, entityId, 'PROCESSOS_SACSGQ').catch(() => false);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const allowed = await ensureAllowed();
    if (!allowed) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

    const processId = Number(params.id);
    if (!Number.isFinite(processId) || processId <= 0) return NextResponse.json({ error: 'Processo inválido' }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));
    const orderedIdsRaw = Array.isArray(body?.orderedPhaseIds) ? body.orderedPhaseIds : [];
    const orderedIds = orderedIdsRaw.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n) && n > 0);
    if (orderedIds.length === 0) return NextResponse.json({ error: 'orderedPhaseIds é obrigatório' }, { status: 400 });

    const phases = await prisma.sacSgqProcessPhase.findMany({
      where: { processId: Math.trunc(processId) },
      select: { id: true },
    });
    const validSet = new Set(phases.map((p) => Number(p.id)));
    const filtered = orderedIds.filter((id) => validSet.has(id));
    if (filtered.length !== phases.length) return NextResponse.json({ error: 'Lista de fases inválida' }, { status: 400 });

    await prisma.$transaction(
      filtered.map((id, idx) =>
        prisma.sacSgqProcessPhase.update({
          where: { id: Math.trunc(id) },
          data: { sequence: idx + 1 },
        })
      )
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

