import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import bcrypt from 'bcryptjs';
import { authenticator } from '../../../../lib/otp';

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
