import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import {
  ensurePaymentTermsByCodes,
  loadClientLookup,
  normalizeDoc,
  normalizeText,
  parseClientCode,
  parseMoneyValue,
  rememberClientInLookup,
  resolveClientFromLookup,
  syncClientPaymentTerms,
} from '../../../../../lib/bulkIntegration';

type BulkClientPayload = {
  clientCode?: number | string | null;
  doc?: string | null;
  name?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  paymentTermCode?: number | string | null;
  paymentTermsErp?: number | string | null;
  abbrevName?: string | null;
  creditLimit?: number | string | null;
  availableLimit?: number | string | null;
  titlesDue?: number | string | null;
  titlesOverdue?: number | string | null;
  invoices?: Array<{
    invoiceNumber?: string | null;
    numFatura?: string | null;
    numero?: string | null;
    num?: string | null;
    issueDate?: string | null;
    dataEmissao?: string | null;
    emissao?: string | null;
    dueDate?: string | null;
    dataVencimento?: string | null;
    vencimento?: string | null;
    totalValue?: number | string | null;
    valor?: number | string | null;
    valorTotal?: number | string | null;
    "valorR$"?: number | string | null;
    status?: string | null;
    situacao?: string | null;
  }> | null;
};

function parsePaymentTermCode(payload: BulkClientPayload): number | null {
  const raw = payload?.paymentTermCode ?? payload?.paymentTermsErp ?? null;
  if (raw === null || raw === undefined) return null;
  const digits = String(raw).trim().replace(/\D+/g, '');
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

function parseDateValue(raw: unknown): Date | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const iso = new Date(s);
  if (Number.isFinite(iso.getTime())) return iso;

  const m = s.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  if (!m) return null;

  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12 || yyyy < 1900 || yyyy > 3000) return null;

  const d = new Date(yyyy, mm - 1, dd);
  return Number.isFinite(d.getTime()) ? d : null;
}

function parseInvoiceStatus(raw: unknown): 'EM_ABERTO' | 'PAGA' {
  return String(raw || '').trim().toUpperCase() === 'PAGA' ? 'PAGA' : 'EM_ABERTO';
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

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({} as any));
    const clients = Array.isArray(body?.clients) ? (body.clients as BulkClientPayload[]) : [];
    if (!clients.length) {
      return NextResponse.json({ error: 'clients é obrigatório e deve ser um array não vazio' }, { status: 400 });
    }

    const hasInvoicesPayload = clients.some((client) => Array.isArray(client?.invoices));
    if (hasInvoicesPayload) {
      await ensureClientInvoiceTable();
    }

    const lookup = await loadClientLookup(clients);
    const paymentTermCodeMap = await ensurePaymentTermsByCodes(
      clients.map((client) => parsePaymentTermCode(client)).filter((code): code is number => Number.isFinite(code) && code > 0)
    );

    const results: Array<{ clientCode: number | null; doc: string | null; id?: number; action?: 'created' | 'updated'; error?: string }> = [];

    for (const payload of clients) {
      const clientCode = parseClientCode(payload);
      const doc = normalizeDoc(payload?.doc || '') || null;
      const name = normalizeText(payload?.name, 191);

      if (!name) {
        results.push({ clientCode, doc, error: 'name é obrigatório' });
        continue;
      }

      const resolved = resolveClientFromLookup(payload, lookup);
      if (resolved.error) {
        results.push({ clientCode, doc, error: resolved.error });
        continue;
      }

      const paymentTermCode = parsePaymentTermCode(payload);
      const paymentTermId = paymentTermCode ? paymentTermCodeMap.get(paymentTermCode) ?? null : null;
      const invoiceRows = Array.isArray(payload?.invoices)
        ? payload.invoices
            .map((it) => {
              const invoiceNumber = normalizeText(
                it?.invoiceNumber ?? it?.numFatura ?? it?.numero ?? it?.num ?? null,
                191
              );
              if (!invoiceNumber) return null;

              const issueDate = parseDateValue(it?.issueDate ?? it?.dataEmissao ?? it?.emissao);
              if (!issueDate) return null;

              const dueDate = parseDateValue(it?.dueDate ?? it?.dataVencimento ?? it?.vencimento);
              const totalValue = parseMoneyValue(
                it?.totalValue ?? it?.valor ?? it?.valorTotal ?? it?.["valorR$"] ?? 0
              ) ?? 0;
              const status = parseInvoiceStatus(it?.status ?? it?.situacao);

              return { invoiceNumber, issueDate, dueDate, totalValue, status };
            })
            .filter(Boolean)
        : null;

      const data = {
        clientCode,
        doc,
        name,
        abbrevName: normalizeText(payload?.abbrevName, 20),
        cep: normalizeText(payload?.cep, 191),
        logradouro: normalizeText(payload?.logradouro, 191),
        numero: normalizeText(payload?.numero, 191),
        bairro: normalizeText(payload?.bairro, 191),
        cidade: normalizeText(payload?.cidade, 191),
        estado: normalizeText(payload?.estado, 191),
        creditLimit: payload?.creditLimit !== undefined ? parseMoneyValue(payload.creditLimit) : undefined,
        availableLimit: payload?.availableLimit !== undefined ? parseMoneyValue(payload.availableLimit) : undefined,
        titlesDue: payload?.titlesDue !== undefined ? parseMoneyValue(payload.titlesDue) : undefined,
        titlesOverdue: payload?.titlesOverdue !== undefined ? parseMoneyValue(payload.titlesOverdue) : undefined,
        paymentTermId,
      } as Record<string, unknown>;

      for (const [key, value] of Object.entries(data)) {
        if (value === undefined) delete data[key];
      }

      try {
        const row = await prisma.$transaction(async (tx) => {
          let saved;
          let action: 'created' | 'updated';

          if (resolved.client?.id) {
            saved = await tx.client.update({
              where: { id: resolved.client.id },
              data,
              select: { id: true, clientCode: true, doc: true },
            });
            action = 'updated';
          } else {
            saved = await tx.client.create({
              data: data as any,
              select: { id: true, clientCode: true, doc: true },
            });
            action = 'created';
          }

          if (paymentTermId) {
            await syncClientPaymentTerms(tx, saved.id, [paymentTermId]);
          }

          if (invoiceRows) {
            await tx.clientInvoice.deleteMany({ where: { clientId: saved.id } });
            if (invoiceRows.length > 0) {
              await tx.clientInvoice.createMany({
                data: invoiceRows.map((inv: any) => ({
                  clientId: saved.id,
                  invoiceNumber: inv.invoiceNumber,
                  issueDate: inv.issueDate,
                  dueDate: inv.dueDate,
                  totalValue: inv.totalValue,
                  status: inv.status,
                })),
                skipDuplicates: true,
              });
            }
          }

          return { saved, action };
        });

        rememberClientInLookup(lookup, row.saved);
        results.push({
          clientCode: row.saved.clientCode ?? clientCode ?? null,
          doc: row.saved.doc ?? doc,
          id: row.saved.id,
          action: row.action,
        });
      } catch (err: any) {
        results.push({
          clientCode,
          doc,
          error: String(err?.message || err),
        });
      }
    }

    return NextResponse.json({ results });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
