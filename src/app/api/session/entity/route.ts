import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';

// GET: Retorna a entidade ativa do usuário
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const uid = session?.user ? Number((session.user as any).id) : undefined;
    if (!uid) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { id: uid },
      select: { lastEntityId: true }
    });

    if (!user?.lastEntityId) {
      const links = await prisma.userEntity.findMany({
        where: { userId: uid },
        take: 2,
        include: { entity: { select: { id: true, name: true, cnpj: true } } },
      });
      if (links.length === 1 && links[0]?.entity?.id) {
        await prisma.user.update({ where: { id: uid }, data: { lastEntityId: links[0].entity.id } });
        return NextResponse.json({ entity: links[0].entity });
      }
      return NextResponse.json({ entity: null });
    }

    const entity = await prisma.entity.findUnique({
      where: { id: user.lastEntityId },
      select: { id: true, name: true, cnpj: true }
    });

    return NextResponse.json({ entity });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

// POST: { entityId } -> define entidade ativa gravando em User.lastEntityId
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const uid = session?.user ? Number((session.user as any).id) : undefined;
    if (!uid) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    const body = await request.json();
    const entityId = Number(body.entityId);
    if (!entityId) return NextResponse.json({ error: 'entityId inválido' }, { status: 400 });
    // Verificar vínculo do usuário com a entidade
    const link = await prisma.userEntity.findUnique({
      where: { userId_entityId: { userId: uid, entityId } },
      select: { id: true },
    });
    if (!link) {
      return NextResponse.json({ error: 'Usuário não vinculado à entidade' }, { status: 403 });
    }
    await prisma.user.update({ where: { id: uid }, data: { lastEntityId: entityId } });
    return NextResponse.json({ ok: true, activeEntityId: entityId });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}
