import { NextResponse } from 'next/server';
import { prisma } from '../../../../../../lib/prisma';
import { loadClientLookup, normalizeStockRows, replaceClientStocks, resolveClientFromLookup } from '../../../../../../lib/bulkIntegration';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({} as any));
    const clients = Array.isArray(body?.clients) ? body.clients : [];
    if (!clients.length) {
      return NextResponse.json({ error: 'clients é obrigatório e deve ser um array não vazio' }, { status: 400 });
    }

    const clientLookup = await loadClientLookup(clients);
    const results: Array<{ clientCode: number | null; doc: string | null; id?: number; updated?: boolean; count?: number; error?: string }> = [];

    for (const payload of clients) {
      const resolved = resolveClientFromLookup(payload, clientLookup);
      if (resolved.error) {
        results.push({
          clientCode: typeof payload?.clientCode === 'number' ? payload.clientCode : null,
          doc: typeof payload?.doc === 'string' ? payload.doc.replace(/\D+/g, '') : null,
          error: resolved.error,
        });
        continue;
      }
      if (!resolved.client?.id) {
        results.push({
          clientCode: typeof payload?.clientCode === 'number' ? payload.clientCode : null,
          doc: typeof payload?.doc === 'string' ? payload.doc.replace(/\D+/g, '') : null,
          error: 'cliente não encontrado',
        });
        continue;
      }

      const stockRows = normalizeStockRows(Array.isArray(payload?.stockItems) ? payload.stockItems : []);

      try {
        await prisma.$transaction(async (tx) => {
          await replaceClientStocks(tx, resolved.client!.id, stockRows);
        });

        results.push({
          clientCode: resolved.client.clientCode,
          doc: resolved.client.doc,
          id: resolved.client.id,
          updated: true,
          count: stockRows.length,
        });
      } catch (err: any) {
        results.push({
          clientCode: resolved.client.clientCode,
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
