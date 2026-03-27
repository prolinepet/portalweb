import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import bcrypt from 'bcryptjs';

// POST: { cnpj, name }
// Cria a entidade especificada, vincula todos os módulos à entidade,
// vincula a entidade ao usuário TI e concede todos os módulos e programas ao usuário TI.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const cnpj = String(body.cnpj ?? '12.345.678/0001-90').trim();
    const name = String(body.name ?? 'Prolinepet SA').trim();
    if (!cnpj || !name) return NextResponse.json({ error: 'CNPJ e Nome obrigatórios' }, { status: 400 });

    // Criar entidade se não existir
    const existingEntity: any[] = await prisma.$queryRawUnsafe(`SELECT id FROM "Entity" WHERE cnpj='${cnpj.replace(/'/g, "''")}' LIMIT 1`);
    let entityId = existingEntity[0]?.id as number | undefined;
    if (!entityId) {
      // createdAt/updatedAt são NOT NULL; definir explicitamente timestamps
      await prisma.$executeRawUnsafe(`INSERT INTO "Entity" (cnpj, name, "isActive", createdAt, updatedAt) VALUES ('${cnpj.replace(/'/g, "''")}', '${name.replace(/'/g, "''")}', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`);
      const row: any[] = await prisma.$queryRawUnsafe(`SELECT id FROM "Entity" WHERE cnpj='${cnpj.replace(/'/g, "''")}' LIMIT 1`);
      entityId = row[0]?.id;
    }
    if (!entityId) return NextResponse.json({ error: 'Falha ao obter id da entidade' }, { status: 500 });

    // Garantir usuário TI
    const tiEmail = 'ti@prolinepet.com.br';
    const tiUserRow: any[] = await prisma.$queryRawUnsafe(`SELECT id FROM "User" WHERE email='${tiEmail}' LIMIT 1`);
    let tiUserId = tiUserRow[0]?.id as number | undefined;
    if (!tiUserId) {
      const hash = await bcrypt.hash('Proli123', 10);
      // updatedAt é NOT NULL; definir manualmente para CURRENT_TIMESTAMP
      await prisma.$executeRawUnsafe(`INSERT INTO "User" (email, name, password, updatedAt) VALUES ('${tiEmail}', 'TI', '${hash.replace(/'/g, "''")}', CURRENT_TIMESTAMP)`);
      const tiRow2: any[] = await prisma.$queryRawUnsafe(`SELECT id FROM "User" WHERE email='${tiEmail}' LIMIT 1`);
      tiUserId = tiRow2[0]?.id;
    }
    if (!tiUserId) return NextResponse.json({ error: 'Falha ao obter id do usuário TI' }, { status: 500 });

    // Atualizar lastEntityId do usuário (se coluna existir)
    try {
      await prisma.$executeRawUnsafe(`UPDATE "User" SET "lastEntityId"=${entityId} WHERE "id"=${tiUserId}`);
    } catch {}

    // Vincular usuário à entidade
    const ueRow: any[] = await prisma.$queryRawUnsafe(`SELECT "id" FROM "UserEntity" WHERE "userId"=${tiUserId} AND "entityId"=${entityId} LIMIT 1`);
    let ueId = ueRow[0]?.id as number | undefined;
    if (!ueId) {
      await prisma.$executeRawUnsafe(`INSERT INTO "UserEntity" ("userId", "entityId") VALUES (${tiUserId}, ${entityId})`);
      const ueRow2: any[] = await prisma.$queryRawUnsafe(`SELECT "id" FROM "UserEntity" WHERE "userId"=${tiUserId} AND "entityId"=${entityId} LIMIT 1`);
      ueId = ueRow2[0]?.id;
    }
    if (!ueId) return NextResponse.json({ error: 'Falha ao obter id do vínculo UserEntity' }, { status: 500 });

    // Vincular todos os módulos existentes à entidade
    const mods: any[] = await prisma.$queryRawUnsafe('SELECT id FROM "Module" WHERE "isActive"=true');
    for (const m of mods) {
      const existsEm: any[] = await prisma.$queryRawUnsafe(`SELECT "id" FROM "EntityModule" WHERE "entityId"=${entityId} AND "moduleId"=${m.id} LIMIT 1`);
      if (existsEm.length === 0) {
        await prisma.$executeRawUnsafe(`INSERT INTO "EntityModule" ("entityId", "moduleId") VALUES (${entityId}, ${m.id})`);
      }
    }

    // Conceder todos os módulos e programas ao usuário TI na entidade
    for (const m of mods) {
      // Vincular módulo ao usuário na entidade
      const uemRow: any[] = await prisma.$queryRawUnsafe(`SELECT "id" FROM "UserEntityModule" WHERE "userEntityId"=${ueId} AND "moduleId"=${m.id} LIMIT 1`);
      let uemId = uemRow[0]?.id as number | undefined;
      if (!uemId) {
      await prisma.$executeRawUnsafe(`INSERT INTO "UserEntityModule" ("userEntityId", "moduleId", "allowed") VALUES (${ueId}, ${m.id}, TRUE)`);
        const uemRow2: any[] = await prisma.$queryRawUnsafe(`SELECT "id" FROM "UserEntityModule" WHERE "userEntityId"=${ueId} AND "moduleId"=${m.id} LIMIT 1`);
        uemId = uemRow2[0]?.id;
      } else {
        await prisma.$executeRawUnsafe(`UPDATE "UserEntityModule" SET "allowed"=TRUE WHERE "id"=${uemId}`);
      }

      // Vincular todos os programas do módulo ao usuário na entidade
      const progs: any[] = await prisma.$queryRawUnsafe(`SELECT id FROM "Program" WHERE "moduleId"=${m.id} AND "isActive"=true`);
      for (const p of progs) {
        const uempRow: any[] = await prisma.$queryRawUnsafe(`SELECT "id" FROM "UserEntityModuleProgram" WHERE "userEntityModuleId"=${uemId} AND "programId"=${p.id} LIMIT 1`);
        if (uempRow.length === 0) {
          await prisma.$executeRawUnsafe(`INSERT INTO "UserEntityModuleProgram" ("userEntityModuleId", "programId", "allowed") VALUES (${uemId}, ${p.id}, TRUE)`);
        } else {
          await prisma.$executeRawUnsafe(`UPDATE "UserEntityModuleProgram" SET "allowed"=TRUE WHERE "id"=${uempRow[0].id}`);
        }
      }
    }

    return NextResponse.json({ ok: true, entityId, userId: tiUserId, modulesLinked: mods.length });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}
