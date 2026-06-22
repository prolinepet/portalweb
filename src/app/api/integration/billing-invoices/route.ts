import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import { normalizeDoc, parseInteger, parseMoneyValue } from '../../../../lib/bulkIntegration';

function firstNonNull<T>(...values: T[]): T | null {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim() !== '') return value;
  }
  return null;
}

function toDateOrNull(value: any): Date | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toShortText(value: any, maxLength: number): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

async function ensureBillingInvoiceRecordTable(): Promise<void> {
  const g = global as any;
  if (g.__billingInvoiceRecordEnsured) return;

  try {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS \`billinginvoicerecord\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`estab\` INT NOT NULL,
        \`clientId\` INT NULL,
        \`canal\` VARCHAR(30) NULL,
        \`dtEmissao\` DATE NULL,
        \`natOper\` VARCHAR(30) NULL,
        \`priceTableId\` INT NULL,
        \`inventoryItemId\` INT NOT NULL,
        \`pesoUnit\` DOUBLE NULL,
        \`commercialFamilyId\` INT NULL,
        \`nroNota\` INT NOT NULL,
        \`serie\` CHAR(5) NOT NULL,
        \`pesoLiq\` DOUBLE NULL,
        \`vlMercLiq\` DOUBLE NULL,
        \`vlMercBru\` DOUBLE NULL,
        \`vlCusto\` DOUBLE NULL,
        \`margemPercent\` DOUBLE NULL,
        \`orderTypeId\` INT NULL,
        \`representativeUserId\` INT NULL,
        \`pedido\` VARCHAR(40) NULL,
        \`dataEmissaoPedido\` DATE NULL,
        \`valorFrete\` DOUBLE NULL,
        \`descItem\` DOUBLE NULL,
        \`nrSeqFat\` INT NOT NULL,
        \`nrSeqDev\` INT NOT NULL,
        \`tipoFatura\` VARCHAR(30) NOT NULL,
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`billinginvoicerecord_unique_key\` (\`estab\`, \`serie\`, \`nroNota\`, \`nrSeqFat\`, \`nrSeqDev\`, \`inventoryItemId\`, \`tipoFatura\`),
        KEY \`billinginvoicerecord_client_idx\` (\`clientId\`),
        KEY \`billinginvoicerecord_pricetable_idx\` (\`priceTableId\`),
        KEY \`billinginvoicerecord_inventoryitem_idx\` (\`inventoryItemId\`),
        KEY \`billinginvoicerecord_commercialfamily_idx\` (\`commercialFamilyId\`),
        KEY \`billinginvoicerecord_ordertype_idx\` (\`orderTypeId\`),
        KEY \`billinginvoicerecord_representative_idx\` (\`representativeUserId\`),
        CONSTRAINT \`billinginvoicerecord_client_fk\` FOREIGN KEY (\`clientId\`) REFERENCES \`client\`(\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`billinginvoicerecord_pricetable_fk\` FOREIGN KEY (\`priceTableId\`) REFERENCES \`tabelapreco\`(\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`billinginvoicerecord_inventoryitem_fk\` FOREIGN KEY (\`inventoryItemId\`) REFERENCES \`inventoryitem\`(\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`billinginvoicerecord_commercialfamily_fk\` FOREIGN KEY (\`commercialFamilyId\`) REFERENCES \`commercialfamily\`(\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`billinginvoicerecord_ordertype_fk\` FOREIGN KEY (\`orderTypeId\`) REFERENCES \`tipopedido\`(\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`billinginvoicerecord_representative_fk\` FOREIGN KEY (\`representativeUserId\`) REFERENCES \`user\`(\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
    );
  } catch {}

  g.__billingInvoiceRecordEnsured = true;
}

async function ensureAllowed(request: Request): Promise<boolean> {
  const envKey = process.env.ERP_INTEGRATION_KEY || process.env.INTEGRATION_API_KEY || '';
  const headerKey = request.headers.get('x-integration-key') || '';
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (envKey && (headerKey === envKey || bearer === envKey)) return true;

  const session = await getServerSession(authOptions);
  const uid = session?.user ? Number((session.user as any).id) : NaN;
  return Number.isFinite(uid) && uid > 0;
}

async function resolveClientId(clientIdValue: number | null, clientCode: number | null, clientDoc: string | null): Promise<number | null> {
  if (clientIdValue) {
    const row = await prisma.client.findUnique({
      where: { id: clientIdValue },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  const normalizedDoc = normalizeDoc(clientDoc || '');
  if (normalizedDoc) {
    const row = await prisma.client.findFirst({
      where: {
        OR: [{ doc: normalizedDoc }, { doc: clientDoc || '' }],
      },
      select: { id: true },
    });
    if (row?.id) return row.id;
  }

  if (!clientCode) return null;
  const rows = await prisma.client.findMany({
    where: { clientCode },
    select: { id: true },
    take: 2,
  });
  if (rows.length > 1) throw new Error(`Cod Emit ${clientCode} ambíguo no cadastro de clientes`);
  return rows[0]?.id ?? null;
}

async function resolvePriceTableId(nrtabpre: string | null): Promise<number | null> {
  if (!nrtabpre) return null;
  const row = await prisma.priceTable.findUnique({
    where: { nrtabpre },
    select: { id: true },
  });
  return row?.id ?? null;
}

async function resolveCommercialFamilyId(commercialFamilyIdValue: number | null, erpCode: string | null): Promise<number | null> {
  if (commercialFamilyIdValue) {
    const row = await prisma.commercialFamily.findUnique({
      where: { id: commercialFamilyIdValue },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  if (!erpCode) return null;
  const rows = await prisma.commercialFamily.findMany({
    where: { erpCode },
    select: { id: true },
    take: 2,
  });
  if (rows.length > 1) throw new Error(`Família Comercial ${erpCode} ambígua no cadastro`);
  return rows[0]?.id ?? null;
}

async function resolveOrderTypeId(orderTypeIdValue: number | null, codtipoped: number | null): Promise<number | null> {
  if (orderTypeIdValue) {
    const row = await prisma.orderType.findUnique({
      where: { id: orderTypeIdValue },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  if (!codtipoped) return null;
  const row = await prisma.orderType.findUnique({
    where: { codtipoped },
    select: { id: true },
  });
  return row?.id ?? null;
}

async function resolveInventoryItemId(inventoryItemIdValue: number | null, sku: string | null): Promise<number | null> {
  if (inventoryItemIdValue) {
    const row = await prisma.inventoryItem.findUnique({
      where: { id: inventoryItemIdValue },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  if (!sku) return null;
  const row = await prisma.inventoryItem.findUnique({
    where: { sku },
    select: { id: true },
  });
  return row?.id ?? null;
}

async function resolveRepresentativeUserId(docValue: string | null): Promise<number | null> {
  if (!docValue) return null;
  const row = await prisma.user.findUnique({
    where: { doc: normalizeDoc(docValue) },
    select: { id: true },
  });
  return row?.id ?? null;
}

export async function POST(request: Request) {
  try {
    await ensureBillingInvoiceRecordTable();
    const allowed = await ensureAllowed(request);
    if (!allowed) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

    const body = await request.json().catch(() => ({} as any));
    const payloads = Array.isArray(body?.records) ? body.records : Array.isArray(body) ? body : [body];
    if (!payloads.length) return NextResponse.json({ error: 'records é obrigatório' }, { status: 400 });

    const results: Array<{ key?: string; id?: number; action?: 'created' | 'updated'; error?: string }> = [];

    for (const payload of payloads) {
      const estab = parseInteger(firstNonNull(payload?.estab, payload?.Estab));
      const clientIdValue = parseInteger(firstNonNull(payload?.clientId, payload?.ClientId));
      const clientCode = parseInteger(firstNonNull(payload?.codEmit, payload?.CodEmit, payload?.clientCode));
      const clientDoc = toShortText(firstNonNull(payload?.cnpj, payload?.cpfCnpj, payload?.clientDoc, payload?.docCliente), 30);
      const canal = toShortText(firstNonNull(payload?.canal, payload?.Canal), 30);
      const dtEmissao = toDateOrNull(firstNonNull(payload?.dtEmissao, payload?.dtEmiss, payload?.dtEmissaoNota));
      const natOper = toShortText(firstNonNull(payload?.natOper, payload?.natoper), 30);
      const nrtabpre = toShortText(firstNonNull(payload?.tabPreco, payload?.nrtabpre, payload?.tabpreco), 20);
      const inventoryItemIdValue = parseInteger(firstNonNull(payload?.inventoryItemId, payload?.InventoryItemId));
      const sku = toShortText(firstNonNull(payload?.item, payload?.sku, payload?.Item), 191);
      const pesoUnit = parseMoneyValue(firstNonNull(payload?.pesoUnit, payload?.peso_unit));
      const commercialFamilyIdValue = parseInteger(firstNonNull(payload?.commercialFamilyId, payload?.CommercialFamilyId));
      const familyErpCode = toShortText(firstNonNull(payload?.familiaComerc, payload?.erpCode, payload?.familyErpCode), 191);
      const nroNota = parseInteger(firstNonNull(payload?.nroNota, payload?.nrNota, payload?.nota));
      const serie = toShortText(firstNonNull(payload?.serie, payload?.Serie), 5);
      const pesoLiq = parseMoneyValue(firstNonNull(payload?.pesoLiq, payload?.peso_liq));
      const vlMercLiq = parseMoneyValue(firstNonNull(payload?.vlMercLiq, payload?.vlMercLiquido));
      const vlMercBru = parseMoneyValue(firstNonNull(payload?.vlMercBru, payload?.vlMercBruto));
      const vlCusto = parseMoneyValue(firstNonNull(payload?.vlCusto, payload?.valorCusto));
      const margemPercent = parseMoneyValue(firstNonNull(payload?.margemPercent, payload?.margem, payload?.margemPct));
      const orderTypeIdValue = parseInteger(firstNonNull(payload?.orderTypeId, payload?.OrderTypeId));
      const codtipoped = parseInteger(firstNonNull(payload?.tipoPedido, payload?.codtipoped, payload?.TipoPedido));
      const representativeDoc = toShortText(firstNonNull(payload?.codRepres, payload?.repDoc, payload?.doc), 191);
      const pedido = toShortText(firstNonNull(payload?.pedido, payload?.Pedido), 40);
      const dataEmissaoPedido = toDateOrNull(firstNonNull(payload?.dataEmissaoPedido, payload?.dtEmissaoPedido));
      const valorFrete = parseMoneyValue(firstNonNull(payload?.valorFrete, payload?.vlFrete));
      const descItem = parseMoneyValue(firstNonNull(payload?.descItem, payload?.descontoItem));
      const nrSeqFat = parseInteger(firstNonNull(payload?.nrSeqFat, payload?.NrSeqFat));
      const nrSeqDev = parseInteger(firstNonNull(payload?.nrSeqDev, payload?.NrSeqDev));
      const tipoFatura = toShortText(firstNonNull(payload?.tipoFatura, payload?.TipoFatura), 30);

      const key = `${estab ?? ''}|${serie ?? ''}|${nroNota ?? ''}|${nrSeqFat ?? ''}|${nrSeqDev ?? ''}|${sku ?? ''}|${tipoFatura ?? ''}`;

      if (!estab || !serie || !nroNota || nrSeqFat == null || nrSeqDev == null || !sku || !tipoFatura) {
        results.push({ key, error: 'Campos obrigatórios da chave: estab, serie, nroNota, nrSeqFat, nrSeqDev, item e tipoFatura' });
        continue;
      }

      try {
        const [clientId, priceTableId, commercialFamilyId, orderTypeId, inventoryItemId, representativeUserId] = await Promise.all([
          resolveClientId(clientIdValue, clientCode, clientDoc),
          resolvePriceTableId(nrtabpre),
          resolveCommercialFamilyId(commercialFamilyIdValue, familyErpCode),
          resolveOrderTypeId(orderTypeIdValue, codtipoped),
          resolveInventoryItemId(inventoryItemIdValue, sku),
          resolveRepresentativeUserId(representativeDoc),
        ]);

        if ((clientIdValue || clientCode || clientDoc) && !clientId) {
          throw new Error(`Cliente não encontrado para os identificadores informados (${clientIdValue ?? clientCode ?? clientDoc})`);
        }
        if (nrtabpre && !priceTableId) throw new Error(`Tabela de preço não encontrada para ${nrtabpre}`);
        if ((commercialFamilyIdValue || familyErpCode) && !commercialFamilyId) {
          throw new Error(`Família comercial não encontrada para ${commercialFamilyIdValue ?? familyErpCode}`);
        }
        if ((orderTypeIdValue || codtipoped) && !orderTypeId) {
          throw new Error(`Tipo de pedido não encontrado para ${orderTypeIdValue ?? codtipoped}`);
        }
        if (!inventoryItemId) throw new Error(`Item não encontrado para ${inventoryItemIdValue ?? sku}`);
        if (representativeDoc && !representativeUserId) throw new Error(`Usuário representante não encontrado para CPF/CNPJ ${representativeDoc}`);

        const existing = await prisma.billingInvoiceRecord.findUnique({
          where: {
            estab_serie_nroNota_nrSeqFat_nrSeqDev_inventoryItemId_tipoFatura: {
              estab,
              serie,
              nroNota,
              nrSeqFat,
              nrSeqDev,
              inventoryItemId,
              tipoFatura,
            },
          },
          select: { id: true },
        });

        const row = await prisma.billingInvoiceRecord.upsert({
          where: {
            estab_serie_nroNota_nrSeqFat_nrSeqDev_inventoryItemId_tipoFatura: {
              estab,
              serie,
              nroNota,
              nrSeqFat,
              nrSeqDev,
              inventoryItemId,
              tipoFatura,
            },
          },
          update: {
            clientId,
            canal,
            dtEmissao,
            natOper,
            priceTableId,
            pesoUnit,
            commercialFamilyId,
            pesoLiq,
            vlMercLiq,
            vlMercBru,
            vlCusto,
            margemPercent,
            orderTypeId,
            representativeUserId,
            pedido,
            dataEmissaoPedido,
            valorFrete,
            descItem,
          },
          create: {
            estab,
            clientId,
            canal,
            dtEmissao,
            natOper,
            priceTableId,
            inventoryItemId,
            pesoUnit,
            commercialFamilyId,
            nroNota,
            serie,
            pesoLiq,
            vlMercLiq,
            vlMercBru,
            vlCusto,
            margemPercent,
            orderTypeId,
            representativeUserId,
            pedido,
            dataEmissaoPedido,
            valorFrete,
            descItem,
            nrSeqFat,
            nrSeqDev,
            tipoFatura,
          },
          select: { id: true },
        });

        results.push({ key, id: row.id, action: existing ? 'updated' : 'created' });
      } catch (err: any) {
        results.push({ key, error: String(err?.message || err) });
      }
    }

    return NextResponse.json({ results });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
