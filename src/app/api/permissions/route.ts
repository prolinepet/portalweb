import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth';
import { prisma } from '../../../lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const uid = session?.user ? Number((session.user as any).id) : undefined;
    let activeEntityId = (session as any)?.entityId ?? (session as any)?.activeEntityId ?? null;
    if (activeEntityId) activeEntityId = Number(activeEntityId);
    if (!uid) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    // Entidades do usuário (usar Prisma para evitar incompatibilidades de SQL)
    const entities = await prisma.entity.findMany({
      where: { isActive: true, userEntities: { some: { userId: uid } } },
      select: { id: true, cnpj: true, name: true },
      orderBy: { name: 'asc' },
    });

    // Módulos e programas permitidos na entidade ativa
    const modules: any[] = [];
    if (activeEntityId) {
      // 1. Buscar módulos ativos vinculados à entidade
      // Query raw original: SELECT m.* FROM Module m JOIN EntityModule em ...
      const entityModules = await prisma.entityModule.findMany({
        where: {
          entityId: activeEntityId,
          module: { isActive: true }
        },
        include: {
          module: true
        },
        orderBy: {
          module: { name: 'asc' }
        }
      });

      for (const em of entityModules) {
        const mod = em.module;
        
        // 2. Checar permissão do usuário no módulo (UserEntityModule)
        // O usuário precisa ter um registro em UserEntityModule com allowed=true
        // para a combinação UserEntity (userId+entityId) e Module
        const userEntityModule = await prisma.userEntityModule.findFirst({
          where: {
            userEntity: {
              userId: uid,
              entityId: activeEntityId
            },
            moduleId: mod.id,
            allowed: true
          }
        });

        if (!userEntityModule) continue;

        // 3. Buscar programas do módulo (Program)
        // Devem estar ativos, showInMenu=true, e permitidos na entidade (EntityModuleProgram)
        const allPrograms = await prisma.program.findMany({
          where: {
            moduleId: mod.id,
            isActive: true,
            showInMenu: true
          },
          orderBy: { name: 'asc' }
        });

        const allowedPrograms: any[] = [];

        for (const prog of allPrograms) {
          // Checar se o programa é permitido na entidade (EntityModuleProgram)
          // Se não existir registro, assume allowed=true (COALESCE no SQL original)
          const emp = await prisma.entityModuleProgram.findUnique({
            where: {
              entityModuleId_programId: {
                entityModuleId: em.id,
                programId: prog.id
              }
            }
          });
          
          const isEntityAllowed = emp ? emp.allowed : true;
          if (!isEntityAllowed) continue;

          // 4. Checar permissão do usuário no programa (UserEntityModuleProgram)
          // Precisa existir registro com allowed=true
          const uemp = await prisma.userEntityModuleProgram.findFirst({
            where: {
              userEntityModuleId: userEntityModule.id,
              programId: prog.id,
              allowed: true
            }
          });

          if (uemp) {
            allowedPrograms.push({
              id: prog.id,
              code: prog.code,
              name: prog.name
            });
          }
        }

        if (allowedPrograms.length > 0) {
          modules.push({
            id: mod.id,
            code: mod.code,
            name: mod.name,
            programs: allowedPrograms
          });
        }
      }
    }

    return NextResponse.json({ activeEntityId, entities, modules });
  } catch (err: any) {
    console.error("Permissions API Error:", err);
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
