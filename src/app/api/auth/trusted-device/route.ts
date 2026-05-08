import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';
import { createHash, randomBytes } from 'crypto';

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const uidRaw = (session?.user as any)?.id;
    const userId = uidRaw != null ? Number(uidRaw) : NaN;
    if (!session || !userId || Number.isNaN(userId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = sha256Hex(token);
    const userAgentRaw = req.headers.get('user-agent');
    const userAgent = userAgentRaw ? String(userAgentRaw).slice(0, 255) : null;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      await tx.trustedDevice.deleteMany({
        where: { userId: Math.trunc(userId), expiresAt: { lt: now } },
      });
      await tx.trustedDevice.create({
        data: {
          userId: Math.trunc(userId),
          tokenHash,
          userAgent,
          expiresAt,
          lastUsedAt: now,
        },
        select: { id: true },
      });
    });

    const res = NextResponse.json({ ok: true });
    res.cookies.set('trustedDevice', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: expiresAt,
    });
    return res;
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
