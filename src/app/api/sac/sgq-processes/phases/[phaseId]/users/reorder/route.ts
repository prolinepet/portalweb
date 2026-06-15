import { NextResponse } from 'next/server';
import { prisma } from '../../../../../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../../../../lib/auth';
import { isProgramAllowed } from '../../../../../../../../lib/isProgramAllowed';

async function ensurePhaseUserSequence(): Promise<void> {
  const g = global as any;
  if (g.__sacSgqPhaseUserSequenceEnsured) return;
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE `sacsgqphaseuser` ADD COLUMN `sequence` INT NOT NULL DEFAULT 1;');
  } catch {}
  try {
    await prisma.$executeRawUnsafe(
      'CREATE INDEX `sacsgqphaseuser_phase_tag_seq_idx` ON `sacsgqphaseuser` (`phaseId`, `tagCode`, `sequence`);'
    );
  } catch {}
  g.__sacSgqPhaseUserSequenceEnsured = true;
}

async function ensureAllowed(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  const userId = session?.user ? Number((session.user as any).id) : NaN;
  const entityIdRaw = (session as any)?.activeEntityId ?? (session as any)?.entityId ?? (session?.user as any)?.lastEntityId ?? null;
  const entityId = entityIdRaw == null ? NaN : Number(entityIdRaw);
  if (!Number.isFinite(userId) || userId <= 0) return false;
  if (!Number.isFinite(entityId) || entityId <= 0) return false;
  return await isProgramAllowed(userId, entityId, 'PROCESSOS_SACSGQ').catch(() => false);
}

export async function PATCH(req: Request, { params }: { params: { phaseId: string } }) {
  try {
    await ensurePhaseUserSequence();
    const allowed = await ensureAllowed();
    if (!allowed) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

    const phaseId = Number(params.phaseId);
    if (!Number.isFinite(phaseId) || phaseId <= 0) return NextResponse.json({ error: 'Fase inválida' }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));

    const tagCodeRaw = (body as any)?.tagCode;
    const tagCode =
      tagCodeRaw == null || tagCodeRaw === ''
        ? null
        : (() => {
            const n = Number(tagCodeRaw);
            return Number.isFinite(n) && n > 0 ? Math.trunc(n) : NaN;
          })();
    if (tagCode !== null && !Number.isFinite(tagCode)) return NextResponse.json({ error: 'TAG inválida' }, { status: 400 });

    const orderedIdsRaw = Array.isArray(body?.orderedPhaseUserIds) ? body.orderedPhaseUserIds : [];
    const orderedIds = orderedIdsRaw.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n) && n > 0);
    if (orderedIds.length === 0) return NextResponse.json({ error: 'orderedPhaseUserIds é obrigatório' }, { status: 400 });

    const existing = await prisma.sacSgqPhaseUser.findMany({
      where: { phaseId: Math.trunc(phaseId), ...(tagCode === null ? { tagCode: null } : { tagCode }) },
      select: { id: true },
    });

    const validSet = new Set(existing.map((r) => Number(r.id)));
    const filtered = orderedIds.filter((id) => validSet.has(id));
    if (filtered.length !== existing.length) return NextResponse.json({ error: 'Lista de usuários inválida' }, { status: 400 });

    await prisma.$transaction(
      filtered.map((id, idx) =>
        prisma.sacSgqPhaseUser.update({
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

