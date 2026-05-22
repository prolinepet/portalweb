import { NextResponse } from 'next/server';
import { prisma } from '../../../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../../lib/auth';
import { isProgramAllowed } from '../../../../../../lib/isProgramAllowed';

async function ensureAllowed(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  const userId = session?.user ? Number((session.user as any).id) : NaN;
  const entityIdRaw = (session as any)?.activeEntityId ?? (session as any)?.entityId ?? (session?.user as any)?.lastEntityId ?? null;
  const entityId = entityIdRaw == null ? NaN : Number(entityIdRaw);
  if (!Number.isFinite(userId) || userId <= 0) return false;
  if (!Number.isFinite(entityId) || entityId <= 0) return false;
  return await isProgramAllowed(userId, entityId, 'PROCESSOS_LOGISTICOS').catch(() => false);
}

export async function POST(req: Request, { params }: { params: { phaseId: string } }) {
  try {
    const allowed = await ensureAllowed();
    if (!allowed) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

    const phaseId = Number(params.phaseId);
    if (!Number.isFinite(phaseId) || phaseId <= 0) return NextResponse.json({ error: 'Fase inválida' }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));
    const userId = Number(body?.userId);
    const allowReturn = Boolean(body?.allowReturn);
    const allowNext = Boolean(body?.allowNext);
    const permissions = body?.permissions == null ? null : body.permissions;

    if (!Number.isFinite(userId) || userId <= 0) return NextResponse.json({ error: 'Usuário inválido' }, { status: 400 });

    const created = await prisma.logisticPhaseNotifiedUser.create({
      data: {
        phaseId: Math.trunc(phaseId),
        userId: Math.trunc(userId),
        allowReturn,
        allowNext,
        permissions,
      },
      include: { user: { select: { id: true, name: true, abbrevName: true } } },
    });
    return NextResponse.json(created);
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate')) {
      return NextResponse.json({ error: 'Este usuário já está vinculado a esta fase.' }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

