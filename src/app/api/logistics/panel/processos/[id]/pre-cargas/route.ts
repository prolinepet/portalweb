import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../../../lib/auth';
import { prisma } from '../../../../../../../lib/prisma';
import { isProgramAllowed } from '../../../../../../../lib/isProgramAllowed';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function ensurePanelProcessTables(): Promise<void> {
  const g = global as any;
  if (g.__logisticsPanelProcessTablesEnsured) return;
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
        PRIMARY KEY (\`id\`)
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
        UNIQUE KEY \`ux_logisticpanelprocessprecarga_process_precarga\` (\`processId\`, \`preCargaId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } catch {}
  const globalAny = global as any;
  globalAny.__logisticsPanelProcessTablesEnsured = true;
}

async function ensureAllowed(): Promise<{ entityId: number } | null> {
  const session = await getServerSession(authOptions);
  const userId = session?.user ? Number((session.user as any).id) : NaN;
  const entityIdRaw = (session as any)?.activeEntityId ?? (session as any)?.entityId ?? null;
  const entityId = entityIdRaw == null ? NaN : Number(entityIdRaw);
  if (!Number.isFinite(userId) || userId <= 0) return null;
  if (!Number.isFinite(entityId) || entityId <= 0) return null;
  const allowed = await isProgramAllowed(userId, entityId, 'PAINEL_LOGISTICO').catch(() => false);
  if (!allowed) return null;
  return { entityId };
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await ensurePanelProcessTables();
    const auth = await ensureAllowed();
    if (!auth) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

    const processId = Number(params.id);
    if (!Number.isFinite(processId) || processId <= 0) return NextResponse.json({ error: 'Processo inválido' }, { status: 400 });

    const processRows: any[] = await prisma.$queryRawUnsafe(`
      SELECT id FROM logisticpanelprocess WHERE id = ${Math.trunc(processId)} AND entityId = ${Math.trunc(auth.entityId)} LIMIT 1
    `);
    if (!Array.isArray(processRows) || processRows.length === 0) {
      return NextResponse.json({ error: 'Processo não encontrado' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({} as any));
    const preCargaId = Number(body?.preCargaId);
    if (!Number.isFinite(preCargaId) || preCargaId <= 0) return NextResponse.json({ error: 'Pré-carga inválida' }, { status: 400 });

    const preCargaRows: any[] = await prisma.$queryRawUnsafe(`
      SELECT id FROM logisticprecarga WHERE id = ${Math.trunc(preCargaId)} AND entityId = ${Math.trunc(auth.entityId)} LIMIT 1
    `);
    if (!Array.isArray(preCargaRows) || preCargaRows.length === 0) {
      return NextResponse.json({ error: 'Pré-carga não encontrada' }, { status: 404 });
    }

    const existing: any[] = await prisma.$queryRawUnsafe(`
      SELECT processId FROM logisticpanelprocessprecarga WHERE preCargaId = ${Math.trunc(preCargaId)} LIMIT 1
    `);
    const linkedProcessId = Array.isArray(existing) && existing[0] ? Number(existing[0].processId) : null;
    if (linkedProcessId != null && Number.isFinite(linkedProcessId) && linkedProcessId === processId) {
      return NextResponse.json({ ok: true, alreadyLinked: true });
    }
    if (linkedProcessId != null && Number.isFinite(linkedProcessId) && linkedProcessId > 0 && linkedProcessId !== processId) {
      return NextResponse.json({ error: `Pré-carga já vinculada ao processo ${linkedProcessId}.` }, { status: 400 });
    }

    await prisma.$executeRawUnsafe(`
      INSERT INTO logisticpanelprocessprecarga (processId, preCargaId, createdAt, updatedAt)
      VALUES (${Math.trunc(processId)}, ${Math.trunc(preCargaId)}, NOW(), NOW())
    `);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
