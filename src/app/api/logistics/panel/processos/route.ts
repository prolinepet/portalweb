import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/prisma';
import { isProgramAllowed } from '../../../../../lib/isProgramAllowed';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function ensurePanelProcessTables(): Promise<void> {
  const g = global as any;
  if (g.__logisticsPanelProcessTablesEnsured) return;

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`logisticprecarga\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`entityId\` INT NOT NULL,
        \`dtPrevCarreg\` DATETIME NULL,
        \`cifFob\` CHAR(3) NULL,
        \`isFinalized\` TINYINT(1) NOT NULL DEFAULT 0,
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        INDEX \`idx_logisticprecarga_entity_final_dt\` (\`entityId\`, \`isFinalized\`, \`dtPrevCarreg\`),
        CONSTRAINT \`fk_logisticprecarga_entity\` FOREIGN KEY (\`entityId\`) REFERENCES \`entity\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } catch {}

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`logisticpanelprocess\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`entityId\` INT NOT NULL,
        \`plate\` VARCHAR(20) NULL,
        \`motorista\` VARCHAR(120) NULL,
        \`transportadora\` VARCHAR(120) NULL,
        \`faseLogistica\` VARCHAR(120) NULL,
        \`statusAnterior\` VARCHAR(120) NULL,
        \`statusAtual\` VARCHAR(120) NULL,
        \`statusProxima\` VARCHAR(120) NULL,
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_logisticpanelprocess_entity_created\` (\`entityId\`, \`createdAt\`),
        CONSTRAINT \`fk_logisticpanelprocess_entity\` FOREIGN KEY (\`entityId\`) REFERENCES \`entity\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } catch {}

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`logisticpanelprocessprecarga\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`processId\` INT NOT NULL,
        \`preCargaId\` INT NOT NULL,
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`ux_logisticpanelprocessprecarga_precarga\` (\`preCargaId\`),
        UNIQUE KEY \`ux_logisticpanelprocessprecarga_process_precarga\` (\`processId\`, \`preCargaId\`),
        KEY \`idx_logisticpanelprocessprecarga_process\` (\`processId\`),
        CONSTRAINT \`fk_logisticpanelprocessprecarga_process\` FOREIGN KEY (\`processId\`) REFERENCES \`logisticpanelprocess\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_logisticpanelprocessprecarga_precarga\` FOREIGN KEY (\`preCargaId\`) REFERENCES \`logisticprecarga\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } catch {}

  g.__logisticsPanelProcessTablesEnsured = true;
}

async function ensureAllowed(): Promise<{ userId: number; entityId: number } | null> {
  const session = await getServerSession(authOptions);
  const userId = session?.user ? Number((session.user as any).id) : NaN;
  const entityIdRaw = (session as any)?.activeEntityId ?? (session as any)?.entityId ?? null;
  const entityId = entityIdRaw == null ? NaN : Number(entityIdRaw);
  if (!Number.isFinite(userId) || userId <= 0) return null;
  if (!Number.isFinite(entityId) || entityId <= 0) return null;
  const allowed = await isProgramAllowed(userId, entityId, 'PAINEL_LOGISTICO').catch(() => false);
  if (!allowed) return null;
  return { userId, entityId };
}

export async function GET() {
  try {
    await ensurePanelProcessTables();
    const auth = await ensureAllowed();
    if (!auth) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

    const rows: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        p.id,
        p.plate,
        p.motorista,
        p.transportadora,
        p.faseLogistica,
        p.statusAnterior,
        p.statusAtual,
        p.statusProxima,
        p.createdAt,
        COALESCE(linked.linkedPreCargaCount, 0) AS linkedPreCargaCount
      FROM logisticpanelprocess p
      LEFT JOIN (
        SELECT processId, COUNT(*) AS linkedPreCargaCount
        FROM logisticpanelprocessprecarga
        GROUP BY processId
      ) linked ON linked.processId = p.id
      WHERE p.entityId = ${Math.trunc(auth.entityId)}
      ORDER BY p.id DESC
    `);

    return NextResponse.json({ processes: Array.isArray(rows) ? rows : [] });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensurePanelProcessTables();
    const auth = await ensureAllowed();
    if (!auth) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

    const body = await request.json().catch(() => ({} as any));
    const plate = String(body?.plate || '').trim() || null;
    const motorista = String(body?.motorista || '').trim() || null;
    const transportadora = String(body?.transportadora || '').trim() || null;
    const faseLogistica = String(body?.faseLogistica || '').trim() || 'Pré-Carga';
    const statusAnterior = String(body?.statusAnterior || '').trim() || null;
    const statusAtual = String(body?.statusAtual || '').trim() || 'Pré-Carga';
    const statusProxima = String(body?.statusProxima || '').trim() || 'Descarga';

    await prisma.$executeRawUnsafe(`
      INSERT INTO logisticpanelprocess
        (entityId, plate, motorista, transportadora, faseLogistica, statusAnterior, statusAtual, statusProxima, createdAt, updatedAt)
      VALUES
        (${Math.trunc(auth.entityId)}, ${plate == null ? 'NULL' : `'${plate.replace(/'/g, "''")}'`}, ${motorista == null ? 'NULL' : `'${motorista.replace(/'/g, "''")}'`},
         ${transportadora == null ? 'NULL' : `'${transportadora.replace(/'/g, "''")}'`}, '${faseLogistica.replace(/'/g, "''")}',
         ${statusAnterior == null ? 'NULL' : `'${statusAnterior.replace(/'/g, "''")}'`}, '${statusAtual.replace(/'/g, "''")}', '${statusProxima.replace(/'/g, "''")}', NOW(), NOW())
    `);

    const createdRows: any[] = await prisma.$queryRawUnsafe('SELECT * FROM logisticpanelprocess WHERE id = LAST_INSERT_ID()');
    return NextResponse.json({ process: Array.isArray(createdRows) ? createdRows[0] ?? null : null });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
