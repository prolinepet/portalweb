import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

if (!process.env.DATABASE_URL) {
  dotenv.config({ path: '.env.local' });
  dotenv.config({ path: '.env' });
}

const globalForPrisma = global as unknown as {
  prisma?: PrismaClient;
  __userColumnsEnsured?: boolean;
  __userColumnsEnsuring?: Promise<void>;
  __userColumnsMiddlewareApplied?: boolean;
};

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient({ log: ['error', 'warn'] });

async function ensureUserColumns(): Promise<void> {
  if (globalForPrisma.__userColumnsEnsured) return;

  if (!globalForPrisma.__userColumnsEnsuring) {
    globalForPrisma.__userColumnsEnsuring = (async () => {
      try {
        const rows = (await prisma.$queryRawUnsafe(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user' AND COLUMN_NAME IN ('abbrevName','costCenter','pixKey')"
        )) as any[];
        const existing = new Set<string>(
          (Array.isArray(rows) ? rows : []).map((r) => String(r?.COLUMN_NAME || r?.column_name || '').trim())
        );

        if (!existing.has('abbrevName')) {
          await prisma.$executeRawUnsafe('ALTER TABLE `user` ADD COLUMN `abbrevName` CHAR(20) NULL');
        }
        if (!existing.has('costCenter')) {
          await prisma.$executeRawUnsafe('ALTER TABLE `user` ADD COLUMN `costCenter` VARCHAR(50) NULL');
        }
        if (!existing.has('pixKey')) {
          await prisma.$executeRawUnsafe('ALTER TABLE `user` ADD COLUMN `pixKey` VARCHAR(191) NULL');
        }
      } catch {}
      globalForPrisma.__userColumnsEnsured = true;
    })();
  }

  await globalForPrisma.__userColumnsEnsuring;
}

if (!globalForPrisma.__userColumnsMiddlewareApplied) {
  prisma.$use(async (params, next) => {
    if (params.model === 'User') {
      await ensureUserColumns();
    }
    return next(params);
  });
  globalForPrisma.__userColumnsMiddlewareApplied = true;
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
