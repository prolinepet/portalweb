import { NextResponse } from 'next/server';
// Rebuild trigger: Fix webpack runtime error
import { prisma } from '../../../lib/prisma';
import bcrypt from 'bcryptjs';

function normalizeDoc(doc: string): string {
  return (doc || '').replace(/\D+/g, '');
}

async function ensureUserAbbrevNameColumn(): Promise<void> {
  const g = global as any;
  if (g.__abbrevNameEnsured) return;
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE `user` ADD COLUMN `abbrevName` CHAR(20) NULL');
  } catch {}
  g.__abbrevNameEnsured = true;
}

async function ensureSalesRepDefaults(userId: number) {
  const uid = Math.trunc(Number(userId));
  if (!uid || Number.isNaN(uid)) return;

  const salesModule = await prisma.module.findUnique({ where: { code: 'SALES' }, select: { id: true } }).catch(() => null);
  if (!salesModule?.id) return;

  const programCodes = ['SALES_CREATE_ORDER', 'SALES_ORDER_SEARCH', 'SALES_CLIENT_SEARCH', 'SALES_PRODUCTION_SCHEDULE'];
  const programs = await prisma.program
    .findMany({ where: { code: { in: programCodes }, moduleId: salesModule.id, isActive: true }, select: { id: true } })
    .catch(() => []);

  const entities = await prisma.entity
    .findMany({ where: { isActive: true }, select: { id: true, cnpj: true }, orderBy: { id: 'asc' } })
    .catch(() => []);
  const cleanEntities = (entities || [])
    .map((e) => ({ id: Number(e.id), cnpj: normalizeDoc(String((e as any)?.cnpj || '')) }))
    .filter((e) => Number.isFinite(e.id) && e.id > 0 && e.cnpj);
  if (!cleanEntities.length) return;

  const primaryByBranch0001 = cleanEntities.find((e) => e.cnpj.length === 14 && e.cnpj.slice(8, 12) === '0001') ?? null;
  const primaryEntityId = primaryByBranch0001?.id ?? cleanEntities[0].id;
  const entityIds = [Math.trunc(primaryEntityId)];

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: uid },
      data: { erpIntegrationMode: 'PROD' },
    });

    await tx.userEntity.createMany({
      data: entityIds.map((entityId) => ({ userId: uid, entityId: Math.trunc(entityId) })),
      skipDuplicates: true,
    });

    const userEntities = await tx.userEntity.findMany({
      where: { userId: uid, entityId: { in: entityIds } },
      select: { id: true },
    });

    await tx.userEntityModule.createMany({
      data: userEntities.map((ue) => ({ userEntityId: ue.id, moduleId: salesModule.id, allowed: true })),
      skipDuplicates: true,
    });

    if (!programs.length) return;

    const uems = await tx.userEntityModule.findMany({
      where: { moduleId: salesModule.id, userEntity: { userId: uid } },
      select: { id: true },
    });

    await tx.userEntityModuleProgram.createMany({
      data: uems.flatMap((uem) => programs.map((p) => ({ userEntityModuleId: uem.id, programId: p.id, allowed: true }))),
      skipDuplicates: true,
    });
  });
}

export async function GET(request: Request) {
  await ensureUserAbbrevNameColumn();
  const url = new URL(request.url);
  const salesRepAdmin = url.searchParams.get('salesRepAdmin');
  const onlyReps = !!(salesRepAdmin && ['1','true','yes'].includes(String(salesRepAdmin).toLowerCase()));
  const users = await prisma.user.findMany({
    where: onlyReps ? { salesRepAdmin: true } : undefined,
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      abbrevName: true,
      email: true,
      doc: true,
      salesRepAdmin: true,
      isSalesAdmin: true,
      twoFactorRequired: true,
      twoFactorSecret: true,
      erpIntegrationMode: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(
    users.map((u) => ({
      id: u.id,
      name: u.name,
      abbrevName: u.abbrevName,
      email: u.email,
      doc: u.doc,
      salesRepAdmin: u.salesRepAdmin,
      isSalesAdmin: u.isSalesAdmin,
      twoFactorRequired: u.twoFactorRequired,
      erpIntegrationMode: u.erpIntegrationMode,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      hasTwoFactorSecret: u.twoFactorSecret != null,
    }))
  );
}

export async function POST(request: Request) {
  try {
    await ensureUserAbbrevNameColumn();
    const data = await request.json().catch(() => ({} as any));
    const name = String(data?.name || '').trim();
    const abbrevNameRaw = data?.abbrevName == null ? null : String(data.abbrevName);
    const abbrevName = abbrevNameRaw == null ? null : String(abbrevNameRaw).trim().slice(0, 20) || null;
    const emailRaw = String(data?.email ?? '').trim();
    const email = emailRaw ? emailRaw : null;
    const passwordStr = String(data?.password || '');
    const erpIntegrationMode = String(data?.erpIntegrationMode || 'TEST');
    const salesRepAdmin = data?.salesRepAdmin;
    const doc = normalizeDoc(String((data as any)?.doc || '')) || null;

    if (!name) return NextResponse.json({ error: 'name é obrigatório' }, { status: 400 });
    if (!passwordStr) return NextResponse.json({ error: 'password é obrigatório' }, { status: 400 });

    const hashed = await bcrypt.hash(passwordStr, 10);

    let finalEmail: string | null = email;
    if (finalEmail) {
      const found = await prisma.user
        .findUnique({ where: { email: String(finalEmail) }, select: { doc: true } })
        .catch(() => null);
      if (found) {
        const isSameUser = doc && found.doc === doc;
        if (!isSameUser) finalEmail = null;
      }
    }

    const shouldEnsureRepDefaults = Boolean(salesRepAdmin);

    if (doc) {
      const existing = await prisma.user.findUnique({ where: { doc }, select: { id: true } }).catch(() => null);
      const update: any = {
        name,
        abbrevName,
        email: finalEmail,
        password: String(hashed),
        erpIntegrationMode,
      };
      if (salesRepAdmin !== undefined) update.salesRepAdmin = Boolean(salesRepAdmin);

      const create: any = {
        name,
        abbrevName,
        email: finalEmail,
        password: String(hashed),
        doc,
        salesRepAdmin: Boolean(salesRepAdmin),
        isSalesAdmin: false,
        erpIntegrationMode,
      };
      const upserted = await prisma.user.upsert({
        where: { doc },
        update,
        create,
        select: {
          id: true,
          name: true,
          abbrevName: true,
          email: true,
          doc: true,
          salesRepAdmin: true,
          isSalesAdmin: true,
          erpIntegrationMode: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (shouldEnsureRepDefaults && !existing?.id) {
        await ensureSalesRepDefaults(Number(upserted.id)).catch(() => {});
      }
      return NextResponse.json(upserted);
    }

    const created = await prisma.user.create({
      data: {
        name,
        abbrevName,
        email: finalEmail,
        password: hashed,
        erpIntegrationMode,
        salesRepAdmin: Boolean(salesRepAdmin),
        isSalesAdmin: false,
      },
      select: { id: true, name: true, abbrevName: true, email: true, createdAt: true, updatedAt: true, salesRepAdmin: true, isSalesAdmin: true, erpIntegrationMode: true },
    });
    if (shouldEnsureRepDefaults) {
      await ensureSalesRepDefaults(Number(created.id)).catch(() => {});
    }
    return NextResponse.json(created);
  } catch (err: any) {
    const msg = String(err?.message || err);
    const isUnique = msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate');
    return NextResponse.json({ error: isUnique ? 'E-mail já existe' : msg }, { status: isUnique ? 409 : 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureUserAbbrevNameColumn();
    const body = await request.json().catch(() => ({} as any));
    const id = Number(body?.id);
    if (!id || Number.isNaN(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

    const update: any = {};
    if (body.name !== undefined) update.name = String(body.name);
    if (body.abbrevName !== undefined) {
      const raw = body.abbrevName == null ? null : String(body.abbrevName);
      update.abbrevName = raw == null ? null : String(raw).trim().slice(0, 20) || null;
    }
    if (body.email !== undefined) update.email = body.email == null ? null : String(body.email);
    if (body.erpIntegrationMode !== undefined) update.erpIntegrationMode = String(body.erpIntegrationMode);
    if (body.salesRepAdmin !== undefined) update.salesRepAdmin = Boolean(body.salesRepAdmin);
    if (body.isSalesAdmin !== undefined) update.isSalesAdmin = Boolean(body.isSalesAdmin);
    if (body.twoFactorRequired !== undefined) update.twoFactorRequired = Boolean(body.twoFactorRequired);
    if (body.doc !== undefined) update.doc = normalizeDoc(String(body.doc || '')) || null;
    if (body.password !== undefined && String(body.password).length > 0) {
      update.password = await bcrypt.hash(String(body.password), 10);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: update,
      select: {
        id: true,
        name: true,
        abbrevName: true,
        email: true,
        doc: true,
        createdAt: true,
        updatedAt: true,
        salesRepAdmin: true,
        isSalesAdmin: true,
        twoFactorRequired: true,
        twoFactorSecret: true,
        erpIntegrationMode: true,
      },
    });
    return NextResponse.json({ ...updated, hasTwoFactorSecret: updated.twoFactorSecret != null });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json().catch(() => ({} as any));
    const ids: number[] = Array.isArray(body?.ids) ? (body.ids as any[]).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0) : [];
    if (!ids.length) return NextResponse.json({ error: 'IDs obrigatórios' }, { status: 400 });
    const result = await prisma.$transaction(async (tx) => {
      await tx.user.updateMany({ where: { id: { in: ids } }, data: { lastEntityId: null } });
      await tx.userEntityModuleProgram.deleteMany({
        where: { userEntityModule: { userEntity: { userId: { in: ids } } } },
      });
      await tx.userEntityModule.deleteMany({
        where: { userEntity: { userId: { in: ids } } },
      });
      await tx.userEntity.deleteMany({ where: { userId: { in: ids } } });
      return tx.user.deleteMany({ where: { id: { in: ids } } });
    });
    return NextResponse.json({ deleted: result.count });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
