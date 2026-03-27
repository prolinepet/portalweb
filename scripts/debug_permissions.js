
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = 'ti@prolinepet.com.br';
  const moduleCode = 'GESTAO_FINTI';

  console.log(`Checking permissions for ${email} on module ${moduleCode}...`);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error('User not found');
    return;
  }
  console.log(`User ID: ${user.id}`);

  const mod = await prisma.module.findUnique({ where: { code: moduleCode } });
  if (!mod) {
    console.error('Module not found');
    return;
  }
  console.log(`Module ID: ${mod.id}, Name: ${mod.name}`);

  const programs = await prisma.program.findMany({
    where: { moduleId: mod.id },
  });
  console.log(`Found ${programs.length} programs:`);
  programs.forEach(p => console.log(` - [${p.id}] ${p.code} (${p.name}) showInMenu=${p.showInMenu}`));

  const userEntityModules = await prisma.userEntityModule.findMany({
    where: {
      userEntity: { userId: user.id },
      moduleId: mod.id,
    },
    include: {
      userEntity: true,
      programs: true,
    }
  });

  if (userEntityModules.length === 0) {
    console.log('No UserEntityModule records found for this user and module.');
  } else {
    console.log(`Found ${userEntityModules.length} UserEntityModule records:`);
    for (const uem of userEntityModules) {
      console.log(` - UserEntityModule ID: ${uem.id} (Entity ID: ${uem.userEntity.entityId}) Allowed: ${uem.allowed}`);
      console.log(`   Programs linked: ${uem.programs.length}`);
      uem.programs.forEach(uemp => {
        console.log(`    - Program ID: ${uemp.programId} Allowed: ${uemp.allowed}`);
      });
    }
  }

  // Check EntityModule and EntityModuleProgram
  const entityModules = await prisma.entityModule.findMany({
    where: {
      moduleId: mod.id,
    },
    include: {
      programs: true
    }
  });

  console.log(`\nFound ${entityModules.length} EntityModule records:`);
  for (const em of entityModules) {
    console.log(` - EntityModule ID: ${em.id} (Entity ID: ${em.entityId})`);
    console.log(`   Programs linked: ${em.programs.length}`);
    em.programs.forEach(emp => {
      console.log(`    - Program ID: ${emp.programId} Allowed: ${emp.allowed}`);
    });
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
