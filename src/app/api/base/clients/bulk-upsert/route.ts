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
};

function parsePaymentTermCode(payload: BulkClientPayload): number | null {
  const raw = payload?.paymentTermCode ?? payload?.paymentTermsErp ?? null;
  if (raw === null || raw === undefined) return null;
  const digits = String(raw).trim().replace(/\D+/g, '');
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({} as any));
    const clients = Array.isArray(body?.clients) ? (body.clients as BulkClientPayload[]) : [];
    if (!clients.length) {
      return NextResponse.json({ error: 'clients é obrigatório e deve ser um array não vazio' }, { status: 400 });
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
