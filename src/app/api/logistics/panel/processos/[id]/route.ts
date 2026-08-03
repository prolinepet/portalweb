import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../../lib/auth';
import { prisma } from '../../../../../../lib/prisma';
import { isProgramAllowed } from '../../../../../../lib/isProgramAllowed';

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

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await ensurePanelProcessTables();
    const auth = await ensureAllowed();
    if (!auth) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

    const processId = Number(params.id);
    if (!Number.isFinite(processId) || processId <= 0) return NextResponse.json({ error: 'Processo inválido' }, { status: 400 });

    const processRows: any[] = await prisma.$queryRawUnsafe(`
      SELECT *
      FROM logisticpanelprocess
      WHERE id = ${Math.trunc(processId)} AND entityId = ${Math.trunc(auth.entityId)}
      LIMIT 1
    `);
    const process = Array.isArray(processRows) ? processRows[0] ?? null : null;
    if (!process) return NextResponse.json({ error: 'Processo não encontrado' }, { status: 404 });

    const preCargas: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        pc.id,
        pc.dtPrevCarreg,
        pc.cifFob,
        pc.isFinalized,
        CASE WHEN link.processId = ${Math.trunc(processId)} THEN 1 ELSE 0 END AS isLinkedToSelected,
        link.processId AS linkedProcessId,
        COALESCE(stats.transportadora, '') AS transportadora,
        COALESCE(stats.cidadesAtendidas, 0) AS cidadesAtendidas,
        COALESCE(stats.clientesAtendidos, 0) AS clientesAtendidos,
        COALESCE(stats.pesoTotalKg, 0) AS pesoTotalKg,
        COALESCE(stats.valorFrete, 0) AS valorFrete
      FROM logisticprecarga pc
      LEFT JOIN logisticpanelprocessprecarga link ON link.preCargaId = pc.id
      LEFT JOIN (
        SELECT
          lpi.preCargaId,
          COUNT(DISTINCT CONCAT(COALESCE(c.estado,''), '|', COALESCE(c.cidade,''))) AS cidadesAtendidas,
          COUNT(DISTINCT so.clientId) AS clientesAtendidos,
          ROUND(SUM(COALESCE(soi.sdoPed, 0)), 2) AS pesoTotalKg,
          ROUND(SUM(COALESCE(soi.discountValue, 0)), 2) AS valorFrete,
          MAX(COALESCE(so.customerName, c.name, c.abbrevName, '')) AS transportadora
        FROM logisticprecargaitem lpi
        INNER JOIN salesorderitem soi ON soi.id = lpi.salesOrderItemId
        INNER JOIN salesorder so ON so.id = soi.orderId
        LEFT JOIN client c ON c.id = so.clientId
        GROUP BY lpi.preCargaId
      ) stats ON stats.preCargaId = pc.id
      WHERE pc.entityId = ${Math.trunc(auth.entityId)}
        AND (link.processId IS NULL OR link.processId = ${Math.trunc(processId)})
      ORDER BY
        CASE WHEN link.processId = ${Math.trunc(processId)} THEN 0 ELSE 1 END,
        pc.id DESC
    `);

    return NextResponse.json({ process, preCargas: Array.isArray(preCargas) ? preCargas : [] });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
