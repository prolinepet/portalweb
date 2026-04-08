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
      if (!existing) return prisma.program.create({ data: { code, name, moduleId, isActive: true } });
      if (existing.moduleId !== moduleId) {
        return prisma.program.update({ where: { code }, data: { moduleId } });
      }
      return existing;
    };
    const clientsProg = await ensureProgram('CLIENTS', 'Clientes', base.id);
    const payTermsProg = await ensureProgram('PAYMENT_TERMS', 'Condição de Pagamento', base.id);
    const commFamilyProg = await ensureProgram('COMMERCIAL_FAMILY', 'Família Comercial', base.id);
    const itemMaintProg = await ensureProgram('ITEM_MAINTENANCE', 'Manutenção de Item', base.id);
    const priceTableListProg = await ensureProgram('PRICE_TABLE_LIST', 'Tabela Preço - Listagem', base.id);
    const priceTableMaintProg = await ensureProgram('PRICE_TABLE_MAINTENANCE', 'Tabela Preço - Manutenção', base.id);
    const orderTypeListProg = await ensureProgram('ORDER_TYPE_LIST', 'Tipo de Pedido - Listagem', base.id);
    const orderTypeMaintProg = await ensureProgram('ORDER_TYPE_MAINTENANCE', 'Tipo de Pedido - Manutenção', base.id);

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
      for (const p of [clientsProg, payTermsProg, commFamilyProg, itemMaintProg, priceTableListProg, priceTableMaintProg, orderTypeListProg, orderTypeMaintProg]) {
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
        for (const p of [clientsProg, payTermsProg, commFamilyProg, itemMaintProg, priceTableListProg, priceTableMaintProg, orderTypeListProg, orderTypeMaintProg]) {
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
      programs: [clientsProg.code, payTermsProg.code, commFamilyProg.code, itemMaintProg.code, priceTableListProg.code, priceTableMaintProg.code, orderTypeListProg.code, orderTypeMaintProg.code],
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
