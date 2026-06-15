import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import { isProgramAllowed } from '../../../../../lib/isProgramAllowed';

async function ensureSacSgqTables(): Promise<void> {
  const g = global as any;
  if (g.__sacSgqTablesEnsured) return;

  try {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS \`sacsgqprocess\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`code\` INT NOT NULL,
        \`description\` VARCHAR(255) NOT NULL,
        \`isActive\` TINYINT(1) NOT NULL DEFAULT 1,
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`sacsgqprocess_code_key\` (\`code\`),
        KEY \`sacsgqprocess_description_idx\` (\`description\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
    );
  } catch {}

  try {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS \`sacsgqprocessphase\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`processId\` INT NOT NULL,
        \`code\` INT NOT NULL,
        \`description\` VARCHAR(255) NOT NULL,
        \`sequence\` INT NOT NULL DEFAULT 1,
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`sacsgqprocessphase_process_code_key\` (\`processId\`, \`code\`),
        KEY \`sacsgqprocessphase_process_idx\` (\`processId\`),
        KEY \`sacsgqprocessphase_process_seq_idx\` (\`processId\`, \`sequence\`),
        CONSTRAINT \`sacsgqprocessphase_process_fk\` FOREIGN KEY (\`processId\`) REFERENCES \`sacsgqprocess\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
    );
  } catch {}

  try {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS \`occurrencetag\` (
        \`code\` INT NOT NULL,
        \`description\` CHAR(60) NOT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`code\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    );
  } catch {}

  try {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS \`sacsgqphaseuser\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`phaseId\` INT NOT NULL,
        \`userId\` INT NOT NULL,
        \`tagCode\` INT NULL,
        \`allowReturn\` TINYINT(1) NOT NULL DEFAULT 0,
        \`allowNext\` TINYINT(1) NOT NULL DEFAULT 0,
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`sacsgqphaseuser_phase_user_tag_key\` (\`phaseId\`, \`userId\`, \`tagCode\`),
        KEY \`sacsgqphaseuser_phase_idx\` (\`phaseId\`),
        KEY \`sacsgqphaseuser_user_idx\` (\`userId\`),
        KEY \`sacsgqphaseuser_tag_idx\` (\`tagCode\`),
        CONSTRAINT \`sacsgqphaseuser_phase_fk\` FOREIGN KEY (\`phaseId\`) REFERENCES \`sacsgqprocessphase\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`sacsgqphaseuser_user_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`sacsgqphaseuser_tag_fk\` FOREIGN KEY (\`tagCode\`) REFERENCES \`occurrencetag\`(\`code\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
    );
  } catch {}

  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE \`sacsgqphaseuser\` ADD COLUMN \`tagCode\` INT NULL;`);
  } catch {}

  try {
    await prisma.$executeRawUnsafe(`CREATE INDEX \`sacsgqphaseuser_tag_idx\` ON \`sacsgqphaseuser\` (\`tagCode\`);`);
  } catch {}

  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE \`sacsgqphaseuser\` DROP INDEX \`sacsgqphaseuser_phase_user_key\`;`);
  } catch {}

  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE \`sacsgqphaseuser\` ADD UNIQUE KEY \`sacsgqphaseuser_phase_user_tag_key\` (\`phaseId\`, \`userId\`, \`tagCode\`);`);
  } catch {}

  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`sacsgqphaseuser\`
         ADD CONSTRAINT \`sacsgqphaseuser_tag_fk\`
         FOREIGN KEY (\`tagCode\`) REFERENCES \`occurrencetag\`(\`code\`) ON DELETE SET NULL;`
    );
  } catch {}

  g.__sacSgqTablesEnsured = true;
}

async function ensureAllowed(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  const userId = session?.user ? Number((session.user as any).id) : NaN;
  const entityIdRaw = (session as any)?.activeEntityId ?? (session as any)?.entityId ?? (session?.user as any)?.lastEntityId ?? null;
  const entityId = entityIdRaw == null ? NaN : Number(entityIdRaw);
  if (!Number.isFinite(userId) || userId <= 0) return false;
  if (!Number.isFinite(entityId) || entityId <= 0) return false;
  return await isProgramAllowed(userId, entityId, 'PROCESSOS_SACSGQ').catch(() => false);
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    await ensureSacSgqTables();
    const allowed = await ensureAllowed();
    if (!allowed) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

    const id = Number(params.id);
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

    const proc = await prisma.sacSgqProcess.findUnique({
      where: { id: Math.trunc(id) },
      include: {
        phases: {
          orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
          include: {
            users: {
              orderBy: [{ id: 'asc' }],
              include: {
                user: { select: { id: true, name: true, abbrevName: true } },
                tag: { select: { code: true, description: true } },
              },
            },
          },
        },
      },
    });
    if (!proc) return NextResponse.json({ error: 'Processo não encontrado' }, { status: 404 });
    return NextResponse.json(proc);
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    await ensureSacSgqTables();
    const allowed = await ensureAllowed();
    if (!allowed) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

    const id = Number(params.id);
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));
    const code = Number(body?.code);
    const description = String(body?.description || '').trim();
    const isActive = body?.isActive == null ? true : Boolean(body.isActive);

    if (!Number.isFinite(code) || code <= 0) return NextResponse.json({ error: 'Cód Processo inválido' }, { status: 400 });
    if (!description) return NextResponse.json({ error: 'Descrição é obrigatória' }, { status: 400 });

    const updated = await prisma.sacSgqProcess.update({
      where: { id: Math.trunc(id) },
      data: { code: Math.trunc(code), description, isActive },
      select: { id: true, code: true, description: true, isActive: true },
    });
    return NextResponse.json(updated);
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate')) {
      return NextResponse.json({ error: 'Já existe um processo com este código.' }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    await ensureSacSgqTables();
    const allowed = await ensureAllowed();
    if (!allowed) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

    const id = Number(params.id);
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

    await prisma.sacSgqProcess.delete({ where: { id: Math.trunc(id) } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
