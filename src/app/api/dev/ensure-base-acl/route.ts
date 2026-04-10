import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';

// Dev utility: garante módulo BASE e programas CLIENTS/PAYMENT_TERMS,
// vinculando-os a todas as entidades e a todos os usuários (ACL completa).
// Idempotente: cria/atualiza somente quando necessário.
export async function POST() {
  try {
    // 1) Garantir módulo BASE
    const base = await prisma.module.upsert({
      where: { code: 'BASE' },
      update: { name: 'Base', description: 'Módulo Base', isActive: true },
      create: { code: 'BASE', name: 'Base', description: 'Módulo Base', isActive: true },
    });

    // 2) Garantir programas do módulo BASE
    const ensureProgram = async (code: string, name: string, moduleId: number) => {
      const existing = await prisma.program.findUnique({ where: { code } });
      if (!existing) return prisma.program.create({ data: { code, name, moduleId, isActive: true, showInMenu: true } });
      if (existing.moduleId !== moduleId) {
        return prisma.program.update({ where: { code }, data: { moduleId, name, isActive: true, showInMenu: true } });
      }
      if (existing.name !== name || !existing.isActive || !existing.showInMenu) {
        return prisma.program.update({ where: { code }, data: { name, isActive: true, showInMenu: true } });
      }
      return existing;
    };
    const clientsProg = await ensureProgram('CLIENTS', 'Clientes', base.id);
    const payTermsProg = await ensureProgram('PAYMENT_TERMS', 'Condição de Pagamento', base.id);
    const commFamilyProg = await ensureProgram('COMMERCIAL_FAMILY', 'Família Comercial', base.id);
    const itemMaintProg = await ensureProgram('ITEM_MAINTENANCE', 'Manutenção de Item', base.id);

    const migrateProgramCode = async (fromCode: string, toCode: string, name: string) => {
      const alreadyTo = await prisma.program.findUnique({ where: { code: toCode } });
      if (alreadyTo) return;
      const from = await prisma.program.findUnique({ where: { code: fromCode } });
      if (!from) return;
      await prisma.program.update({
        where: { code: fromCode },
        data: { code: toCode, name, moduleId: base.id, isActive: true, showInMenu: true },
      });
    };

    await migrateProgramCode('PRICE_TABLE_LIST', 'PRICE_TABLE_ADMIN', 'Administração Tabela Preço');
    await migrateProgramCode('PRICE_TABLE_MAINTENANCE', 'PRICE_TABLE_ADMIN', 'Administração Tabela Preço');
    await migrateProgramCode('ORDER_TYPE_LIST', 'ORDER_TYPE_ADMIN', 'Administração Tipo de Pedido');
    await migrateProgramCode('ORDER_TYPE_MAINTENANCE', 'ORDER_TYPE_ADMIN', 'Administração Tipo de Pedido');

    const priceTableProg = await ensureProgram('PRICE_TABLE_ADMIN', 'Administração Tabela Preço', base.id);
    const orderTypeProg = await ensureProgram('ORDER_TYPE_ADMIN', 'Administração Tipo de Pedido', base.id);

    await prisma.program.updateMany({
      where: { code: { in: ['PRICE_TABLE_LIST', 'PRICE_TABLE_MAINTENANCE', 'ORDER_TYPE_LIST', 'ORDER_TYPE_MAINTENANCE'] } },
      data: { isActive: false, showInMenu: false },
    });

    // 3) Vincular módulo BASE a todas as entidades
    const entities = await prisma.entity.findMany();
    let entityModuleLinked = 0;
    for (const e of entities) {
      await prisma.entityModule.upsert({
        where: { entityId_moduleId: { entityId: e.id, moduleId: base.id } },
        update: {},
        create: { entityId: e.id, moduleId: base.id },
      });
      entityModuleLinked++;
    }

    // 4) Vincular programas ao EntityModule (permitidos por padrão)
    const baseEMs = await prisma.entityModule.findMany({ where: { moduleId: base.id } });
    let entityModuleProgramsLinked = 0;
    for (const em of baseEMs) {
      for (const p of [clientsProg, payTermsProg, commFamilyProg, itemMaintProg, priceTableProg, orderTypeProg]) {
        await prisma.entityModuleProgram.upsert({
          where: { entityModuleId_programId: { entityModuleId: em.id, programId: p.id } },
          update: { allowed: true },
          create: { entityModuleId: em.id, programId: p.id, allowed: true },
        });
        entityModuleProgramsLinked++;
      }
    }

    // 5) Vincular todos os usuários às entidades e permitir módulo/programas
    const users = await prisma.user.findMany();
    let userEntityLinked = 0;
    let userEntityModuleLinked = 0;
    let userProgramLinked = 0;
    for (const u of users) {
      for (const e of entities) {
        const ue = await prisma.userEntity.upsert({
          where: { userId_entityId: { userId: u.id, entityId: e.id } },
          update: {},
          create: { userId: u.id, entityId: e.id },
        });
        userEntityLinked++;
        const uem = await prisma.userEntityModule.upsert({
          where: { userEntityId_moduleId: { userEntityId: ue.id, moduleId: base.id } },
          update: { allowed: true },
          create: { userEntityId: ue.id, moduleId: base.id, allowed: true },
        });
        userEntityModuleLinked++;
        for (const p of [clientsProg, payTermsProg, commFamilyProg, itemMaintProg, priceTableProg, orderTypeProg]) {
          await prisma.userEntityModuleProgram.upsert({
            where: { userEntityModuleId_programId: { userEntityModuleId: uem.id, programId: p.id } },
            update: { allowed: true },
            create: { userEntityModuleId: uem.id, programId: p.id, allowed: true },
          });
          userProgramLinked++;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      module: { id: base.id, code: base.code },
      programs: [clientsProg.code, payTermsProg.code, commFamilyProg.code, itemMaintProg.code, priceTableProg.code, orderTypeProg.code],
      stats: {
        entities: entities.length,
        users: users.length,
        entityModuleLinked,
        entityModuleProgramsLinked,
        userEntityLinked,
        userEntityModuleLinked,
        userProgramLinked,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}
