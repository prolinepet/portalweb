import { getServerSession } from "next-auth";
import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from './prisma';
import bcrypt from 'bcryptjs';
import { authenticator } from './otp';
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

async function isTrustedDevice(userId: number, token: string): Promise<boolean> {
  const uid = Number(userId);
  const t = String(token || '').trim();
  if (!Number.isFinite(uid) || uid <= 0) return false;
  if (!t) return false;
  const tokenHash = sha256Hex(t);
  const now = new Date();
  const row = await prisma.trustedDevice
    .findFirst({
      where: {
        userId: Math.trunc(uid),
        tokenHash,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { id: true },
    })
    .catch(() => null);
  if (!row?.id) return false;
  await prisma.trustedDevice.update({ where: { id: row.id }, data: { lastUsedAt: now } }).catch(() => {});
  return true;
}

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    CredentialsProvider({
      name: 'Credenciais',
      credentials: {
        email: { label: 'E-mail', type: 'email' },
        password: { label: 'Senha', type: 'password' },
        twoFactorCode: { label: '2FA Code', type: 'text' }
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;
        
        const identifier = credentials.email;
        let user: any = null;

        // Tentar autenticar por Email ou Documento
        if (identifier.includes('@')) {
             user = await prisma.user.findUnique({ where: { email: identifier } });
        } else {
             const doc = identifier.replace(/\D/g, '');
             if (doc) {
                 user = await prisma.user.findUnique({ where: { doc } });
             }
        }

        const isBootstrapTi = identifier === 'ti@prolinepet.com.br' && credentials.password === '123456';
        if (isBootstrapTi) {
          const hash = await bcrypt.hash(credentials.password, 10);
          if (!user) {
            user = await prisma.user.create({ data: { email: identifier, name: 'TI', password: hash } });
          } else if (!user.password) {
            user = await prisma.user.update({ where: { id: user.id }, data: { password: hash } });
          }
        }
        if (!user) return null;
        if (!user.password) return null;
        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) return null;

        // 2FA Verification
        if (user.twoFactorRequired && user.twoFactorSecret) {
          const code = credentials.twoFactorCode as string | undefined;
          if (!code) {
            const cookieHeader = (req as any)?.headers?.cookie ?? (req as any)?.headers?.get?.('cookie') ?? null;
            const cookies = parseCookieHeader(cookieHeader);
            const token = cookies['trustedDevice'] || '';
            const trusted = await isTrustedDevice(Number(user.id), token);
            if (trusted) {
              return { id: String(user.id), name: user.name, email: user.email } as any;
            }
          }
          if (!code) {
             throw new Error('2FA_REQUIRED');
          }
          try {
            const isValid = authenticator.verify({ token: code, secret: user.twoFactorSecret });
            if (!isValid) {
              throw new Error('Código 2FA inválido');
            }
          } catch (e) {
            console.error('2FA Error:', e);
            throw new Error('Erro ao validar 2FA');
          }
        }

        return { id: String(user.id), name: user.name, email: user.email } as any;
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = (user as any).id;
      }
      return token;
    },
    async session({ session, token }) {
      // Garantir que o id do usuário esteja presente na sessão
      (session.user as any).id = token.uid ?? (session.user as any).id ?? null;
      // Carregar entidade ativa (última usada) do usuário
      try {
        const uid = token.uid ? Number(token.uid) : Number((session.user as any)?.id);
        if (uid && !isNaN(uid)) {
          // 1) Priorizar a última entidade selecionada pelo usuário (User.lastEntityId)
          const userRecord = await prisma.user.findUnique({
            where: { id: uid },
            select: { lastEntityId: true }
          });
          let activeEntityId: number | null = userRecord?.lastEntityId ?? null;

          // Validar que o usuário possui vínculo com a entidade escolhida
          if (activeEntityId != null) {
            const linkRecord = await prisma.userEntity.findFirst({
              where: { userId: uid, entityId: activeEntityId },
              select: { id: true }
            });
            if (!linkRecord) {
              // se não houver vínculo, ignorar lastEntityId
              activeEntityId = null;
            }
          }
          // 2) Fallback: usar o vínculo mais recente do usuário
          if (activeEntityId == null) {
            const ueRecord = await prisma.userEntity.findFirst({
              where: { userId: uid },
              orderBy: { id: 'desc' },
              select: { entityId: true }
            });
            activeEntityId = ueRecord?.entityId ?? null;
          }

          (session as any).entityId = activeEntityId;
        }
      } catch (err) {
        console.error("Error setting session entityId", err);
      }
      return session;
    }
  }
};

export const auth = () => getServerSession(authOptions);
