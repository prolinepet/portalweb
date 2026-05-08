import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import bcrypt from 'bcryptjs';
import { authenticator } from '../../../../lib/otp';
import { createHash } from 'crypto';

function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = String(cookieHeader || '').trim();
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const s = part.trim();
    if (!s) continue;
    const idx = s.indexOf('=');
    if (idx <= 0) continue;
    const k = s.slice(0, idx).trim();
    const v = s.slice(idx + 1).trim();
    if (!k) continue;
    out[k] = decodeURIComponent(v);
  }
  return out;
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email e senha obrigatórios' }, { status: 400 });
    }

    let user: any = null;
    if (email.includes('@')) {
         user = await prisma.user.findUnique({ where: { email } });
    } else {
         const doc = email.replace(/\D/g, '');
         if (doc) {
             user = await prisma.user.findUnique({ where: { doc } });
         }
    }
    
    if (!user) {
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
    }

    if (!user.password) {
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
    }

    if (!user.twoFactorRequired) {
      return NextResponse.json({ required: false });
    }

    if (user.twoFactorSecret) {
      const cookieHeader = req.headers.get('cookie');
      const token = parseCookieHeader(cookieHeader)['trustedDevice'] || '';
      if (token) {
        const tokenHash = sha256Hex(token);
        const now = new Date();
        const row = await prisma.trustedDevice
          .findFirst({
            where: { userId: user.id, tokenHash, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
            select: { id: true },
          })
          .catch(() => null);
        if (row?.id) {
          await prisma.trustedDevice.update({ where: { id: row.id }, data: { lastUsedAt: now } }).catch(() => {});
          return NextResponse.json({ required: false });
        }
      }
      return NextResponse.json({ required: true, setup: false });
    }

    // Need setup
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(user.email, 'Prolinepet', secret);

    return NextResponse.json({ required: true, setup: true, secret, otpauth });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
