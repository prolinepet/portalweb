import { prisma } from './prisma';

export async function isProgramAllowed(userId: number, entityId: number | null, programCode: string): Promise<boolean> {
  const eid = entityId == null ? null : Number(entityId);
  if (!eid || !Number.isFinite(eid)) return false;

  const [program, userEntity] = await Promise.all([
    prisma.program.findUnique({ where: { code: programCode }, select: { id: true, moduleId: true } }),
    prisma.userEntity.findUnique({ where: { userId_entityId: { userId, entityId: eid } }, select: { id: true } }),
  ]);

  if (!program?.id || !program.moduleId) return false;
  if (!userEntity?.id) return false;

  const [uem, em] = await Promise.all([
    prisma.userEntityModule.findUnique({
      where: { userEntityId_moduleId: { userEntityId: userEntity.id, moduleId: program.moduleId } },
      select: { id: true, allowed: true },
    }),
    prisma.entityModule.findUnique({
      where: { entityId_moduleId: { entityId: eid, moduleId: program.moduleId } },
      select: { id: true },
    }),
  ]);

  if (!uem?.id || !Boolean(uem.allowed)) return false;
  if (!em?.id) return false;

  const [uemp, emp] = await Promise.all([
    prisma.userEntityModuleProgram.findUnique({
      where: { userEntityModuleId_programId: { userEntityModuleId: uem.id, programId: program.id } },
      select: { allowed: true },
    }),
    prisma.entityModuleProgram.findUnique({
      where: { entityModuleId_programId: { entityModuleId: em.id, programId: program.id } },
      select: { allowed: true },
    }),
  ]);

  const userAllowed = Boolean(uemp?.allowed);
  if (!userAllowed) return false;

  const entityAllowed = emp ? Boolean(emp.allowed) : true;
  return entityAllowed;
}

