import { prisma } from './prisma';

export async function isProgramAllowed(userId: number, entityId: number | null, programCode: string): Promise<boolean> {
  const eid = entityId == null ? null : Number(entityId);
  if (!eid || !Number.isFinite(eid)) return false;

  const program = await prisma.program.findUnique({ where: { code: programCode }, select: { id: true, moduleId: true } });
  if (!program?.id || !program.moduleId) return false;

  const moduleId = Number(program.moduleId);

  const uemRows = await prisma
    .$queryRawUnsafe<any[]>(
      `SELECT uem.id as id
       FROM userentitymodule uem
       JOIN userentity ue ON ue.id = uem.userEntityId
       WHERE ue.userId = ? AND ue.entityId = ? AND uem.moduleId = ? AND uem.allowed = 1 AND uem.id IS NOT NULL
       ORDER BY uem.id DESC
       LIMIT 1`,
      Number(userId),
      eid,
      moduleId,
    )
    .catch(() => []);
  const userEntityModuleId = uemRows?.[0]?.id ? Number(uemRows[0].id) : null;
  if (!userEntityModuleId || !Number.isFinite(userEntityModuleId)) return false;

  const uempRows = await prisma
    .$queryRawUnsafe<any[]>(
      `SELECT id
       FROM userentitymoduleprogram
       WHERE userEntityModuleId = ? AND programId = ? AND allowed = 1 AND id IS NOT NULL
       ORDER BY id DESC
       LIMIT 1`,
      Math.trunc(userEntityModuleId),
      Math.trunc(Number(program.id)),
    )
    .catch(() => []);
  if (!uempRows?.[0]?.id) return false;

  const emRows = await prisma
    .$queryRawUnsafe<any[]>(
      `SELECT id
       FROM entitymodule
       WHERE entityId = ? AND moduleId = ? AND id IS NOT NULL
       ORDER BY id DESC
       LIMIT 1`,
      eid,
      moduleId,
    )
    .catch(() => []);
  const entityModuleId = emRows?.[0]?.id ? Number(emRows[0].id) : null;
  if (!entityModuleId || !Number.isFinite(entityModuleId)) return false;

  const empRows = await prisma
    .$queryRawUnsafe<any[]>(
      `SELECT allowed
       FROM entitymoduleprogram
       WHERE entityModuleId = ? AND programId = ? AND id IS NOT NULL
       ORDER BY id DESC
       LIMIT 1`,
      Math.trunc(entityModuleId),
      Math.trunc(Number(program.id)),
    )
    .catch(() => []);

  if (!empRows || empRows.length === 0) return true;
  return Boolean(empRows?.[0]?.allowed);
}

