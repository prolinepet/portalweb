import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '../../../../lib/prisma';
import { normalizeDoc, normalizeText, parseBoolean, parseInteger } from '../../../../lib/bulkIntegration';

async function ensureUserColumns(): Promise<void> {
  const g = global as any;
  if (g.__userColumnsEnsuredBulk) return;
  try {
    const rows = (await prisma.$queryRawUnsafe(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user' AND COLUMN_NAME IN ('abbrevName','costCenter','pixKey','repCode')"
    )) as any[];
    const existing = new Set<string>((Array.isArray(rows) ? rows : []).map((row) => String(row?.COLUMN_NAME || row?.column_name || '').trim()));

    if (!existing.has('abbrevName')) {
      await prisma.$executeRawUnsafe('ALTER TABLE `user` ADD COLUMN `abbrevName` CHAR(20) NULL');
    }
    if (!existing.has('costCenter')) {
      await prisma.$executeRawUnsafe('ALTER TABLE `user` ADD COLUMN `costCenter` VARCHAR(50) NULL');
    }
    if (!existing.has('pixKey')) {
      await prisma.$executeRawUnsafe('ALTER TABLE `user` ADD COLUMN `pixKey` VARCHAR(191) NULL');
    }
    if (!existing.has('repCode')) {
      await prisma.$executeRawUnsafe('ALTER TABLE `user` ADD COLUMN `repCode` INT NULL');
    }
  } catch {}
  g.__userColumnsEnsuredBulk = true;
}

export async function POST(request: Request) {
  try {
    await ensureUserColumns();

    const body = await request.json().catch(() => ({} as any));
    const users = Array.isArray(body?.users) ? body.users : [];
    if (!users.length) {
      return NextResponse.json({ error: 'users é obrigatório e deve ser um array não vazio' }, { status: 400 });
    }

    const docs = Array.from(new Set(users.map((user: any) => normalizeDoc(user?.doc || '')).filter((doc: string) => !!doc)));
    const existingUsers = docs.length
      ? await prisma.user.findMany({
          where: { doc: { in: docs } },
          select: { id: true, doc: true, email: true },
        })
      : [];
    const existingByDoc = new Map(existingUsers.map((user) => [String(user.doc || ''), user]));

    const requestedEmails = Array.from(
      new Set(users.map((user: any) => normalizeText(user?.email, 191)).filter((email: string | null): email is string => !!email))
    );
    const existingEmails = requestedEmails.length
      ? await prisma.user.findMany({
          where: { email: { in: requestedEmails } },
          select: { id: true, doc: true, email: true },
        })
      : [];
    const emailToOwnerDoc = new Map(existingEmails.map((user) => [String(user.email || '').toLowerCase(), String(user.doc || '')]));

    const results: Array<{ doc: string | null; id?: number; action?: 'created' | 'updated'; error?: string }> = [];

    for (const payload of users) {
      const doc = normalizeDoc(payload?.doc || '') || null;
      const name = normalizeText(payload?.name, 191);
      const email = normalizeText(payload?.email, 191)?.toLowerCase() ?? null;
      const password = String(payload?.password || '');
      const repCode = parseInteger(payload?.repCode);

      if (!doc) {
        results.push({ doc: null, error: 'doc é obrigatório' });
        continue;
      }
      if (!name) {
        results.push({ doc, error: 'name é obrigatório' });
        continue;
      }
      if (!password) {
        results.push({ doc, error: 'password é obrigatório' });
        continue;
      }

      const emailOwnerDoc = email ? emailToOwnerDoc.get(email) ?? null : null;
      const finalEmail = email && emailOwnerDoc && emailOwnerDoc !== doc ? null : email;
      const existing = existingByDoc.get(doc) ?? null;

      try {
        const hashed = await bcrypt.hash(password, 10);
        const row = await prisma.user.upsert({
          where: { doc },
          update: {
            name,
            abbrevName: normalizeText(payload?.abbrevName, 20),
            repCode,
            email: finalEmail,
            password: hashed,
            erpIntegrationMode: normalizeText(payload?.erpIntegrationMode, 10) ?? 'TEST',
            salesRepAdmin: parseBoolean(payload?.salesRepAdmin, false),
            costCenter: normalizeText(payload?.costCenter, 50),
            pixKey: normalizeText(payload?.pixKey, 191),
          },
          create: {
            doc,
            name,
            abbrevName: normalizeText(payload?.abbrevName, 20),
            repCode,
            email: finalEmail,
            password: hashed,
            erpIntegrationMode: normalizeText(payload?.erpIntegrationMode, 10) ?? 'TEST',
            salesRepAdmin: parseBoolean(payload?.salesRepAdmin, false),
            isSalesAdmin: false,
            costCenter: normalizeText(payload?.costCenter, 50),
            pixKey: normalizeText(payload?.pixKey, 191),
          },
          select: { id: true, doc: true, email: true },
        });

        existingByDoc.set(doc, row);
        if (finalEmail) emailToOwnerDoc.set(finalEmail, doc);

        results.push({
          doc,
          id: row.id,
          action: existing?.id ? 'updated' : 'created',
        });
      } catch (err: any) {
        results.push({ doc, error: String(err?.message || err) });
      }
    }

    return NextResponse.json({ results });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
