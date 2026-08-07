import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function ensureClientInvoiceTable(): Promise<void> {
  const g = global as any;
  if (g.__clientInvoiceEnsured) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`clientinvoice\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`clientId\` INT NOT NULL,
        \`invoiceNumber\` VARCHAR(191) NOT NULL,
        \`issueDate\` DATETIME NOT NULL,
        \`dueDate\` DATETIME NULL,
        \`totalValue\` FLOAT NOT NULL,
        \`status\` VARCHAR(191) NOT NULL DEFAULT 'EM_ABERTO',
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`ux_clientinvoice_client_invoice\` (\`clientId\`, \`invoiceNumber\`),
        KEY \`idx_clientinvoice_clientid\` (\`clientId\`),
        KEY \`idx_clientinvoice_duedate\` (\`dueDate\`),
        KEY \`idx_clientinvoice_status\` (\`status\`),
        CONSTRAINT \`fk_clientinvoice_client\` FOREIGN KEY (\`clientId\`) REFERENCES \`client\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } catch {}
  g.__clientInvoiceEnsured = true;
}

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await ensureClientInvoiceTable();

    const clientId = Number(params.id);
    if (!Number.isFinite(clientId) || clientId <= 0) return NextResponse.json([]);

    const url = new URL(request.url);
    const filter = String(url.searchParams.get('filter') || 'all').trim().toLowerCase();
    const today = startOfToday();

    const where: any = { clientId: Math.trunc(clientId) };
    if (filter === 'due' || filter === 'a_vencer' || filter === 'avencer') {
      where.dueDate = { gte: today };
      where.status = { not: 'PAGA' };
    } else if (filter === 'overdue' || filter === 'vencidos' || filter === 'vencido') {
      where.dueDate = { lt: today };
      where.status = { not: 'PAGA' };
    }

    const invoices = await prisma.clientInvoice.findMany({
      where,
      select: {
        id: true,
        clientId: true,
        invoiceNumber: true,
        issueDate: true,
        dueDate: true,
        status: true,
        totalValue: true,
      },
      orderBy: [{ issueDate: 'desc' }, { id: 'desc' }],
    });

    return NextResponse.json(invoices);
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
