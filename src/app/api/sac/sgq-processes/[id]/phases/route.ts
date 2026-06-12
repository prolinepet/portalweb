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
  return await isProgramAllowed(userId, entityId, 'PROCESSOS_SACSGQ').catch(() => false);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const allowed = await ensureAllowed();
    if (!allowed) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

    const processId = Number(params.id);
    if (!Number.isFinite(processId) || processId <= 0) return NextResponse.json({ error: 'Processo inválido' }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));
    const code = Number(body?.code);
    const description = String(body?.description || '').trim();

    if (!Number.isFinite(code) || code <= 0) return NextResponse.json({ error: 'Cód Fase inválido' }, { status: 400 });
    if (!description) return NextResponse.json({ error: 'Descrição da fase é obrigatória' }, { status: 400 });

    const last = await prisma.sacSgqProcessPhase.findFirst({
      where: { processId: Math.trunc(processId) },
      orderBy: [{ sequence: 'desc' }, { id: 'desc' }],
      select: { sequence: true },
    });
    const nextSeq = Number(last?.sequence ?? 0) + 1;

    const created = await prisma.sacSgqProcessPhase.create({
      data: {
        processId: Math.trunc(processId),
        code: Math.trunc(code),
        description,
        sequence: nextSeq,
      },
      select: { id: true, processId: true, code: true, description: true, sequence: true },
    });
    return NextResponse.json(created);
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate')) {
      return NextResponse.json({ error: 'Já existe uma fase com este código neste processo.' }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

