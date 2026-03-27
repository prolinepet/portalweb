import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { setResetCode } from '../../../../lib/resetStore';
import { sendEmail } from '../../../../lib/email';

function generateCode() {
  const n = Math.floor(100000 + Math.random() * 900000);
  return String(n);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body?.email || '').trim().toLowerCase();
    if (!email) return NextResponse.json({ message: 'E-mail é obrigatório' }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ message: 'E-mail não cadastrado' }, { status: 404 });
    }

    const code = generateCode();
    // TTL de 10 minutos
    setResetCode(email, code, 10 * 60 * 1000);

    // Send email via configured SMTP
    try {
      await sendEmail({
        to: email,
        subject: 'Recuperação de Senha - Prolinepet',
        html: `
          <div style="font-family: sans-serif; padding: 20px;">
            <h2>Recuperação de Senha</h2>
            <p>Olá, ${user.name}.</p>
            <p>Seu código de verificação é:</p>
            <h1 style="color: #4F46E5; font-size: 32px; letter-spacing: 5px;">${code}</h1>
            <p>Este código expira em 10 minutos.</p>
            <p>Se você não solicitou, ignore este e-mail.</p>
          </div>
        `
      });
    } catch (e) {
      console.error('Falha ao enviar e-mail:', e);
      // Fallback log
      console.log(`[Forgot Password Fallback] Código ${code} enviado para ${email}`);
    }

    return NextResponse.json({ ok: true, message: 'Código enviado' });
  } catch {
    return NextResponse.json({ message: 'Erro ao solicitar código' }, { status: 500 });
  }
}
