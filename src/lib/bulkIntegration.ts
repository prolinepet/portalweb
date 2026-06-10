import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';

export type ClientLookupRow = {
  id: number;
  doc: string | null;
  clientCode: number | null;
};

export type ClientLookup = {
  byDoc: Map<string, ClientLookupRow>;
  byCode: Map<number, ClientLookupRow[]>;
};

export function normalizeDoc(doc: unknown): string {
  return String(doc ?? '').replace(/\D+/g, '');
}

export function normalizeText(value: unknown, maxLength?: number): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return maxLength && maxLength > 0 ? text.slice(0, maxLength) : text;
}

export function parseInteger(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.trunc(value) : null;
  }
  const text = String(value).trim();
  if (!text) return null;
  const digits = text.replace(/\D+/g, '');
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

export function parseMoneyValue(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Number(value) : null;
  }
  const text = String(value).trim();
  if (!text) return null;
  const normalized = text.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseBoolean(value: unknown, defaultValue = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return defaultValue;
  const text = String(value).trim().toLowerCase();
  if (!text) return defaultValue;
  if (['1', 'true', 't', 'yes', 'y', 'sim', 's'].includes(text)) return true;
  if (['0', 'false', 'f', 'no', 'n', 'nao', 'não'].includes(text)) return false;
  return defaultValue;
}

export function parseClientCode(payload: any): number | null {
  return (
    parseInteger(payload?.clientCode) ??
    parseInteger(payload?.codCliente) ??
    parseInteger(payload?.codcliente) ??
    parseInteger(payload?.codigoCliente) ??
    parseInteger(payload?.codCli) ??
    parseInteger(payload?.codcli) ??
    null
  );
}

export function parseClientDoc(payload: any): string | null {
  const doc = normalizeDoc(payload?.doc ?? payload?.clientDoc ?? payload?.cnpjCpf ?? payload?.cpfCnpj ?? '');
  return doc || null;
}

export async function loadClientLookup(payloads: any[]): Promise<ClientLookup> {
  const docs = Array.from(new Set(payloads.map((item) => parseClientDoc(item)).filter((item): item is string => !!item)));
  const clientCodes = Array.from(new Set(payloads.map((item) => parseClientCode(item)).filter((item): item is number => Number.isFinite(item) && item > 0)));

  if (docs.length === 0 && clientCodes.length === 0) {
    return { byDoc: new Map(), byCode: new Map() };
  }

  const rows = await prisma.client.findMany({
    where: {
      OR: [
        ...(docs.length ? [{ doc: { in: docs } }] : []),
        ...(clientCodes.length ? [{ clientCode: { in: clientCodes } }] : []),
      ],
    },
    select: { id: true, doc: true, clientCode: true },
  });

  const byDoc = new Map<string, ClientLookupRow>();
  const byCode = new Map<number, ClientLookupRow[]>();

  for (const row of rows) {
    const normalizedDoc = normalizeDoc(row.doc || '');
    if (normalizedDoc) byDoc.set(normalizedDoc, row);
    if (typeof row.clientCode === 'number' && Number.isFinite(row.clientCode)) {
      const key = Math.trunc(row.clientCode);
      const list = byCode.get(key) ?? [];
      list.push(row);
      byCode.set(key, list);
    }
  }

  return { byDoc, byCode };
}

export function resolveClientFromLookup(
  payload: any,
  lookup: ClientLookup
): { client: ClientLookupRow | null; doc: string | null; clientCode: number | null; error?: string } {
  const doc = parseClientDoc(payload);
  const clientCode = parseClientCode(payload);

  if (!doc && !clientCode) {
    return { client: null, doc: null, clientCode: null, error: 'doc ou clientCode é obrigatório' };
  }

  const byDoc = doc ? lookup.byDoc.get(doc) ?? null : null;
  const byCodeList = clientCode ? lookup.byCode.get(clientCode) ?? [] : [];

  if (byDoc && byCodeList.length > 0 && !byCodeList.some((row) => row.id === byDoc.id)) {
    return { client: null, doc, clientCode, error: 'doc e clientCode apontam para clientes diferentes' };
  }

  if (byDoc) return { client: byDoc, doc, clientCode };

  if (byCodeList.length > 1) {
    return { client: null, doc, clientCode, error: 'clientCode ambíguo; existe mais de um cliente com esse código' };
  }

  if (byCodeList.length === 1) {
    return { client: byCodeList[0], doc, clientCode };
  }

  return { client: null, doc, clientCode };
}

export function rememberClientInLookup(lookup: ClientLookup, client: ClientLookupRow) {
  const doc = normalizeDoc(client.doc || '');
  if (doc) lookup.byDoc.set(doc, client);
  if (typeof client.clientCode === 'number' && Number.isFinite(client.clientCode)) {
    lookup.byCode.set(Math.trunc(client.clientCode), [client]);
  }
}

export async function ensurePaymentTermsByCodes(codes: number[]): Promise<Map<number, number>> {
  const uniqueCodes = Array.from(new Set(codes.map((code) => Number(code)).filter((code) => Number.isFinite(code) && code > 0).map((code) => Math.trunc(code))));
  if (!uniqueCodes.length) return new Map();

  await prisma.paymentTerm.createMany({
    data: uniqueCodes.map((code) => ({
      code,
      description: `Condição ${code}`,
      installments: 1,
    })),
    skipDuplicates: true,
  }).catch(() => {});

  const rows = await prisma.paymentTerm.findMany({
    where: { code: { in: uniqueCodes } },
    select: { id: true, code: true },
  });

  return new Map(rows.map((row) => [Number(row.code), Number(row.id)]));
}

export async function ensurePriceTablesByNumbers(values: string[]): Promise<Map<string, number>> {
  const uniqueValues = Array.from(
    new Set(
      values
        .map((value) => String(value ?? '').trim())
        .filter((value) => value.length > 0)
        .map((value) => value.slice(0, 20))
    )
  );
  if (!uniqueValues.length) return new Map();

  await prisma.priceTable.createMany({
    data: uniqueValues.map((nrtabpre) => ({
      nrtabpre,
      descricao: `Tabela ${nrtabpre}`,
      situacao: 1,
    })),
    skipDuplicates: true,
  }).catch(() => {});

  const rows = await prisma.priceTable.findMany({
    where: { nrtabpre: { in: uniqueValues } },
    select: { id: true, nrtabpre: true },
  });

  return new Map(rows.map((row) => [row.nrtabpre, Number(row.id)]));
}

export async function syncClientPaymentTerms(tx: Prisma.TransactionClient, clientId: number, paymentTermIds: number[]) {
  await tx.clientPaymentTerm.deleteMany({ where: { clientId } });
  if (!paymentTermIds.length) return;

  await tx.clientPaymentTerm.createMany({
    data: paymentTermIds.map((paymentTermId, index) => ({
      clientId,
      paymentTermId,
      position: index,
    })),
    skipDuplicates: true,
  });
}

export async function syncClientPriceTables(tx: Prisma.TransactionClient, clientId: number, priceTableIds: number[]) {
  await tx.clientPriceTable.deleteMany({ where: { clientId } });
  if (!priceTableIds.length) return;

  await tx.clientPriceTable.createMany({
    data: priceTableIds.map((priceTableId) => ({
      clientId,
      priceTableId,
    })),
    skipDuplicates: true,
  });
}

export type ClientStockRow = {
  sku: string;
  lotSerie: string;
  qtyCurrent: number;
  qtyAvailable: number;
};

export function normalizeStockRows(stockItems: any[]): ClientStockRow[] {
  const out: ClientStockRow[] = [];
  const seen = new Set<string>();

  for (const item of Array.isArray(stockItems) ? stockItems : []) {
    const sku = normalizeText(item?.sku ?? item?.item ?? item?.codItem ?? item?.codigoItem ?? item?.codigo, 50);
    if (!sku) continue;

    const lotSerie = String(item?.lotSerie ?? item?.loteSerie ?? item?.lote ?? item?.serie ?? '').trim().slice(0, 60);
    const qtyCurrent =
      parseMoneyValue(
        item?.qtyCurrent ??
        item?.qtdeAtual ??
        item?.qtdAtual ??
        item?.qtAtual ??
        item?.quantidadeAtual ??
        item?.quantAtual ??
        item?.quantidade
      ) ?? 0;
    const qtyAvailable =
      parseMoneyValue(
        item?.qtyAvailable ??
        item?.qtdeDisp ??
        item?.qtdDisp ??
        item?.qtDisp ??
        item?.quantidadeDisponivel ??
        item?.quantDisp
      ) ?? qtyCurrent;

    const key = `${sku}::${lotSerie}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      sku,
      lotSerie,
      qtyCurrent,
      qtyAvailable,
    });
  }

  return out;
}

export async function replaceClientStocks(tx: Prisma.TransactionClient, clientId: number, stockRows: ClientStockRow[]) {
  await tx.clientItemStock.deleteMany({ where: { clientId } });
  if (!stockRows.length) return;

  await tx.clientItemStock.createMany({
    data: stockRows.map((row) => ({
      clientId,
      sku: row.sku,
      lotSerie: row.lotSerie,
      qtyCurrent: row.qtyCurrent,
      qtyAvailable: row.qtyAvailable,
    })),
  });
}
