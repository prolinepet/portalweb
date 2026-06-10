import { NextResponse } from 'next/server';
import { prisma } from '../../../../../../lib/prisma';
import {
  ensurePaymentTermsByCodes,
  ensurePriceTablesByNumbers,
  loadClientLookup,
  parseInteger,
  resolveClientFromLookup,
  syncClientPaymentTerms,
  syncClientPriceTables,
} from '../../../../../../lib/bulkIntegration';

type CommercialConfigPayload = {
  clientCode?: number | string | null;
  doc?: string | null;
  condicoesPagamento?: Array<number | string | Record<string, unknown>>;
  nrtabpreList?: Array<string | Record<string, unknown>>;
};

function parsePaymentTermCodes(payload: CommercialConfigPayload): number[] {
  const raw = Array.isArray(payload?.condicoesPagamento) ? payload.condicoesPagamento : [];
  return Array.from(
    new Set(
      raw
        .map((item) => {
          if (typeof item === 'object' && item) {
            return parseInteger((item as any)?.code ?? (item as any)?.codigo ?? (item as any)?.paymentTermCode ?? (item as any)?.condPagtoCode);
          }
          return parseInteger(item);
        })
        .filter((item): item is number => Number.isFinite(item) && item > 0)
    )
  );
}

function parsePriceTableNumbers(payload: CommercialConfigPayload): string[] {
  const raw = Array.isArray(payload?.nrtabpreList) ? payload.nrtabpreList : [];
  return Array.from(
    new Set(
      raw
        .map((item) => {
          if (typeof item === 'object' && item) {
            return String((item as any)?.nrtabpre ?? (item as any)?.nrTabpre ?? (item as any)?.codigo ?? '').trim();
          }
          return String(item ?? '').trim();
        })
        .filter((item) => item.length > 0)
        .map((item) => item.slice(0, 20))
    )
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({} as any));
    const clients = Array.isArray(body?.clients) ? (body.clients as CommercialConfigPayload[]) : [];
    if (!clients.length) {
      return NextResponse.json({ error: 'clients é obrigatório e deve ser um array não vazio' }, { status: 400 });
    }

    const clientLookup = await loadClientLookup(clients);
    const paymentTermMap = await ensurePaymentTermsByCodes(clients.flatMap((payload) => parsePaymentTermCodes(payload)));
    const priceTableMap = await ensurePriceTablesByNumbers(clients.flatMap((payload) => parsePriceTableNumbers(payload)));

    const results: Array<{ clientCode: number | null; doc: string | null; id?: number; updated?: boolean; error?: string }> = [];

    for (const payload of clients) {
      const resolved = resolveClientFromLookup(payload, clientLookup);
      if (resolved.error) {
        results.push({ clientCode: parseInteger(payload?.clientCode), doc: String(payload?.doc || '').replace(/\D+/g, '') || null, error: resolved.error });
        continue;
      }
      if (!resolved.client?.id) {
        results.push({ clientCode: parseInteger(payload?.clientCode), doc: String(payload?.doc || '').replace(/\D+/g, '') || null, error: 'cliente não encontrado' });
        continue;
      }

      const paymentTermIds = parsePaymentTermCodes(payload)
        .map((code) => paymentTermMap.get(code) ?? null)
        .filter((id): id is number => Number.isFinite(id) && id > 0);
      const priceTableIds = parsePriceTableNumbers(payload)
        .map((nrtabpre) => priceTableMap.get(nrtabpre) ?? null)
        .filter((id): id is number => Number.isFinite(id) && id > 0);

      try {
        await prisma.$transaction(async (tx) => {
          await syncClientPaymentTerms(tx, resolved.client!.id, paymentTermIds);
          await syncClientPriceTables(tx, resolved.client!.id, priceTableIds);
          await tx.client.update({
            where: { id: resolved.client!.id },
            data: { paymentTermId: paymentTermIds[0] ?? null },
          });
        });

        results.push({
          clientCode: resolved.client.clientCode ?? parseInteger(payload?.clientCode),
          doc: resolved.client.doc,
          id: resolved.client.id,
          updated: true,
        });
      } catch (err: any) {
        results.push({
          clientCode: resolved.client.clientCode ?? parseInteger(payload?.clientCode),
          doc: resolved.client.doc,
          id: resolved.client.id,
          error: String(err?.message || err),
        });
      }
    }

    return NextResponse.json({ results });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
