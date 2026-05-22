import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import { isProgramAllowed } from '../../../../lib/isProgramAllowed';

async function ensureLogisticsTables(): Promise<void> {
  const g = global as any;
  if (g.__logisticsTablesEnsured) return;

  try {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS \`logisticprocess\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`code\` INT NOT NULL,
        \`description\` VARCHAR(255) NOT NULL,
        \`isActive\` TINYINT(1) NOT NULL DEFAULT 1,
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`logisticprocess_code_key\` (\`code\`),
        KEY \`logisticprocess_description_idx\` (\`description\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
    );
  } catch {}

  try {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS \`logisticprocessphase\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`processId\` INT NOT NULL,
        \`code\` INT NOT NULL,
        \`description\` VARCHAR(255) NOT NULL,
        \`isAuto\` TINYINT(1) NOT NULL DEFAULT 0,
        \`sequence\` INT NOT NULL DEFAULT 1,
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`logisticprocessphase_process_code_key\` (\`processId\`, \`code\`),
        KEY \`logisticprocessphase_process_idx\` (\`processId\`),
        KEY \`logisticprocessphase_process_seq_idx\` (\`processId\`, \`sequence\`),
        CONSTRAINT \`logisticprocessphase_process_fk\` FOREIGN KEY (\`processId\`) REFERENCES \`logisticprocess\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
    );
  } catch {}

  try {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS \`logisticphaseuser\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`phaseId\` INT NOT NULL,
        \`userId\` INT NOT NULL,
        \`allowReturn\` TINYINT(1) NOT NULL DEFAULT 0,
        \`allowNext\` TINYINT(1) NOT NULL DEFAULT 0,
        \`permissions\` JSON NULL,
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`logisticphaseuser_phase_user_key\` (\`phaseId\`, \`userId\`),
        KEY \`logisticphaseuser_phase_idx\` (\`phaseId\`),
        KEY \`logisticphaseuser_user_idx\` (\`userId\`),
        CONSTRAINT \`logisticphaseuser_phase_fk\` FOREIGN KEY (\`phaseId\`) REFERENCES \`logisticprocessphase\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`logisticphaseuser_user_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
    );
  } catch {}

  g.__logisticsTablesEnsured = true;
}

async function ensureAllowed(): Promise<{ userId: number; entityId: number } | null> {
  const session = await getServerSession(authOptions);
  const userId = session?.user ? Number((session.user as any).id) : NaN;
  const entityIdRaw = (session as any)?.activeEntityId ?? (session as any)?.entityId ?? (session?.user as any)?.lastEntityId ?? null;
  const entityId = entityIdRaw == null ? NaN : Number(entityIdRaw);
  if (!Number.isFinite(userId) || userId <= 0) return null;
  if (!Number.isFinite(entityId) || entityId <= 0) return null;

  const allowed = await isProgramAllowed(userId, entityId, 'PROCESSOS_LOGISTICOS').catch(() => false);
  if (!allowed) return null;
  return { userId, entityId };
}

export async function GET() {
  try {
    await ensureLogisticsTables();
    const auth = await ensureAllowed();
    if (!auth) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

    const rows = await prisma.logisticProcess.findMany({
      orderBy: [{ code: 'asc' }],
      select: { id: true, code: true, description: true, isActive: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await ensureLogisticsTables();
    const auth = await ensureAllowed();
    if (!auth) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

    const body = await req.json().catch(() => ({} as any));
    const code = Number(body?.code);
    const description = String(body?.description || '').trim();
    const isActive = body?.isActive == null ? true : Boolean(body.isActive);

    if (!Number.isFinite(code) || code <= 0) return NextResponse.json({ error: 'Cód Processo inválido' }, { status: 400 });
    if (!description) return NextResponse.json({ error: 'Descrição é obrigatória' }, { status: 400 });

    const created = await prisma.logisticProcess.create({
      data: { code: Math.trunc(code), description, isActive },
      select: { id: true, code: true, description: true, isActive: true },
    });
    return NextResponse.json(created);
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate')) {
      return NextResponse.json({ error: 'Já existe um processo com este código.' }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

