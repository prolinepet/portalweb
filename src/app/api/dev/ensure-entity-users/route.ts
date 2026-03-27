import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import bcrypt from 'bcryptjs';

// Dev utility: ensures the default entity, users and all ACL links exist.
// Idempotent: safely creates missing records and fixes mismatched program-module associations.
export async function POST() {
  try {
    // 1) Ensure baseline modules
    const admin = await prisma.module.upsert({
      where: { code: 'ADMIN' },
      update: {},
      create: { code: 'ADMIN', name: 'Administração', description: 'Administração do sistema', isActive: true }
    });
    const maint = await prisma.module.upsert({
      where: { code: 'MAINT' },
      update: {},
      create: { code: 'MAINT', name: 'Manutenção', description: 'Manutenção industrial', isActive: true }
    });
    const sales = await prisma.module.upsert({
      where: { code: 'SALES' },
      update: {},
      create: { code: 'SALES', name: 'Vendas', description: 'Força de vendas', isActive: true }
    });

    // 2) Ensure baseline programs and fix modules if needed
    const ensureProgram = async (code: string, name: string, moduleId: number) => {
      const existing = await prisma.program.findUnique({ where: { code } });
      if (!existing) {
        return prisma.program.create({ data: { code, name, moduleId, isActive: true } });
      }
      if (existing.moduleId !== moduleId) {
        return prisma.program.update({ where: { code }, data: { moduleId } });
      }
      return existing;
    };

    // MAINT programs
    await ensureProgram('DASHBOARD', 'Dashboard', maint.id);
    await ensureProgram('ASSETS', 'Ativos', maint.id);
    await ensureProgram('WORK_ORDERS', 'Ordens de Serviço', maint.id);
    await ensureProgram('REPORTS', 'Relatórios', maint.id);
    // ADMIN programs
    await ensureProgram('USERS', 'Usuários', admin.id);
    await ensureProgram('SETTINGS', 'Configurações', admin.id);
    await ensureProgram('ADMIN_ENTITIES', 'Cadastro de Entidade', admin.id);
    await ensureProgram('ADMIN_MODULES', 'Cadastro de Módulo', admin.id);
    // SALES programs
    await ensureProgram('SALES_CREATE_ORDER', 'Inclusão de Pedidos', sales.id);
    await ensureProgram('SALES_ORDER_SEARCH', 'Consulta de Pedidos', sales.id);
    await ensureProgram('SALES_CLIENT_SEARCH', 'Consulta de Clientes', sales.id);
    await ensureProgram('SALES_PRODUCTION_SCHEDULE', 'Agenda Produção', sales.id);
    await ensureProgram('SALES_REPRESENTATIVE', 'Representante', sales.id);

    // 3) Ensure default entity (Prolinepet)
    const defaultCnpj = '45.992.476/0001-94';
    const defaultName = 'Prolinepet';
    const entity = await prisma.entity.upsert({
      where: { cnpj: defaultCnpj },
      update: { name: defaultName, isActive: true },
      create: { cnpj: defaultCnpj, name: defaultName, isActive: true }
    });

    // 4) Link entity to all modules and programs
    const modules = [admin, maint, sales];
    for (const m of modules) {
      const em = await prisma.entityModule.upsert({
        where: { entityId_moduleId: { entityId: entity.id, moduleId: m.id } },
        update: {},
        create: { entityId: entity.id, moduleId: m.id }
      });
      const progs = await prisma.program.findMany({ where: { moduleId: m.id } });
      for (const p of progs) {
        await prisma.entityModuleProgram.upsert({
          where: { entityModuleId_programId: { entityModuleId: em.id, programId: p.id } },
          update: { allowed: true },
          create: { entityModuleId: em.id, programId: p.id, allowed: true }
        });
      }
    }

    // 5) Ensure users TI and Técnico
    const ensureUser = async (email: string, name: string, plainPassword: string) => {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) return existing;
      const hashed = await bcrypt.hash(plainPassword, 10);
      return prisma.user.create({ data: { email, name, password: hashed } });
    };
    const ti = await ensureUser('ti@prolinepet.com.br', 'TI', 'Proli123');
    const tec = await ensureUser('tecnico@prolinepet.com.br', 'Técnico', 'Proli123');

    // 6) Link users to entity
    const linkUserEntity = async (userId: number, entityId: number) => {
      return prisma.userEntity.upsert({
        where: { userId_entityId: { userId, entityId } },
        update: {},
        create: { userId, entityId }
      });
    };
    const tiUE = await linkUserEntity(ti.id, entity.id);
    await linkUserEntity(tec.id, entity.id);

    // 7) Grant all modules to TI (allowed=1)
    for (const m of modules) {
      await prisma.userEntityModule.upsert({
        where: { userEntityId_moduleId: { userEntityId: tiUE.id, moduleId: m.id } },
        update: { allowed: true },
        create: { userEntityId: tiUE.id, moduleId: m.id, allowed: true }
      });
    }

    // 8) Optionally grant all programs to TI as explicit rows
    for (const m of modules) {
      const uem = await prisma.userEntityModule.findUnique({
        where: { userEntityId_moduleId: { userEntityId: tiUE.id, moduleId: m.id } }
      });
      if (!uem) continue;
      const progs = await prisma.program.findMany({ where: { moduleId: m.id } });
      for (const p of progs) {
        await prisma.userEntityModuleProgram.upsert({
          where: { userEntityModuleId_programId: { userEntityModuleId: uem.id, programId: p.id } },
          update: { allowed: true },
          create: { userEntityModuleId: uem.id, programId: p.id, allowed: true }
        });
      }
    }

    return NextResponse.json({
      ok: true,
      entity: { id: entity.id, cnpj: entity.cnpj, name: entity.name },
      users: [
        { id: ti.id, email: ti.email, name: ti.name },
        { id: tec.id, email: tec.email, name: tec.name }
      ],
      message: 'Entidade, usuários e vínculos garantidos com sucesso (idempotente).'
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}
