import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import bcrypt from 'bcryptjs';

function normalizeDoc(doc: string): string {
  return (doc || '').replace(/\D+/g, '');
}

function parseOptionalInt(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const digits = String(value).trim().replace(/\D+/g, '');
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

async function ensureUserRepCodeColumn(): Promise<void> {
  const g = global as any;
  if (g.__userRepCodeEnsuredDocRoute) return;
  try {
    const rows = (await prisma.$queryRawUnsafe(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user' AND COLUMN_NAME IN ('repCode')"
    )) as any[];
    const existing = new Set<string>((Array.isArray(rows) ? rows : []).map((row) => String(row?.COLUMN_NAME || row?.column_name || '').trim()));
    if (!existing.has('repCode')) {
      await prisma.$executeRawUnsafe('ALTER TABLE `user` ADD COLUMN `repCode` INT NULL');
    }
  } catch {}
  g.__userRepCodeEnsuredDocRoute = true;
}

function isUniqueEmailError(err: any): boolean {
  const code = err?.code;
  if (code === 'P2002') {
    const target = err?.meta?.target;
    if (Array.isArray(target)) return target.includes('email');
    if (typeof target === 'string') return target.includes('email');
    return true;
  }
  const msg = String(err?.message || err || '');
  return msg.toLowerCase().includes('unique') && msg.toLowerCase().includes('email');
}

export async function GET(_: Request, props: { params: Promise<{ doc: string }> }) {
  const params = await props.params;
  try {
    await ensureUserRepCodeColumn();
    const raw = params.doc ?? '';
    const doc = normalizeDoc(raw);
    if (!doc) return NextResponse.json({ error: 'doc inválido' }, { status: 400 });
    const user = await prisma.user.findUnique({
      where: { doc },
      select: { id: true, name: true, abbrevName: true, repCode: true, email: true, doc: true, salesRepAdmin: true, createdAt: true, updatedAt: true },
    });
    if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    return NextResponse.json(user);
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function PATCH(request: Request, props: { params: Promise<{ doc: string }> }) {
  const params = await props.params;
  try {
    await ensureUserRepCodeColumn();
    const raw = params.doc ?? '';
    const doc = normalizeDoc(raw);
    if (!doc) return NextResponse.json({ error: 'doc inválido' }, { status: 400 });
    const body = await request.json().catch(() => ({} as any));
    const data: any = {};
    if (body.name !== undefined) data.name = String(body.name);
    if (body.abbrevName !== undefined) {
      const raw = body.abbrevName == null ? null : String(body.abbrevName);
      data.abbrevName = raw == null ? null : String(raw).trim().slice(0, 20) || null;
    }
    if (body.email !== undefined) {
      const emailRaw = body.email == null ? '' : String(body.email);
      const email = emailRaw.trim();
      data.email = email ? email : null;
    }
    if (body.doc !== undefined) data.doc = normalizeDoc(String(body.doc || '')) || null;
    if (body.repCode !== undefined) data.repCode = parseOptionalInt(body.repCode);
    if (body.salesRepAdmin !== undefined) data.salesRepAdmin = Boolean(body.salesRepAdmin);
    if (body.erpIntegrationMode !== undefined) data.erpIntegrationMode = String(body.erpIntegrationMode);
    if (body.password !== undefined && String(body.password).length > 0) {
      data.password = await bcrypt.hash(String(body.password), 10);
    }

    if (data.email !== undefined && data.email !== null) {
      const found = await prisma.user.findUnique({ where: { email: String(data.email) }, select: { doc: true } }).catch(() => null);
      if (found && found.doc !== doc) data.email = null;
    }

    if (Object.keys(data).length === 0) return NextResponse.json({ message: 'Nada para atualizar' });

    try {
      const updated = await prisma.user.update({
        where: { doc },
        data,
        select: { id: true, name: true, abbrevName: true, repCode: true, email: true, doc: true, salesRepAdmin: true, createdAt: true, updatedAt: true },
      });
      return NextResponse.json(updated);
    } catch (e: any) {
      if (data.email != null && isUniqueEmailError(e)) {
        const updated = await prisma.user.update({
          where: { doc },
          data: { ...data, email: null },
          select: { id: true, name: true, abbrevName: true, repCode: true, email: true, doc: true, salesRepAdmin: true, createdAt: true, updatedAt: true },
        });
        return NextResponse.json(updated);
      }
      throw e;
    }
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
