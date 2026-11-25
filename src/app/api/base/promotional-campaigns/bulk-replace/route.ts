import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { normalizeDoc, normalizeText, parseInteger, parseMoneyValue } from '../../../../../lib/bulkIntegration';
import { ensurePromotionalCampaignTable } from '../../../../../lib/promotional-campaigns';

type BulkCampaignPayload = {
  campaignCode?: number | string | null;
  codCampanha?: number | string | null;
  campaignDescription?: string | null;
  descCampanha?: string | null;
  customerDocInitial?: string | null;
  customerDocFinal?: string | null;
  representativeDocInitial?: string | null;
  representativeDocFinal?: string | null;
  orderTypeCodeInitial?: number | string | null;
  orderTypeCodeFinal?: number | string | null;
  priceTableCodeInitial?: string | null;
  priceTableCodeFinal?: string | null;
  commercialFamilyCodeInitial?: string | null;
  commercialFamilyCodeFinal?: string | null;
  itemCodeInitial?: string | null;
  itemCodeFinal?: string | null;
  paymentConditionCodeInitial?: number | string | null;
  paymentConditionCodeFinal?: number | string | null;
  quantityInitial?: number | string | null;
  quantityFinal?: number | string | null;
  valueInitial?: number | string | null;
  valueFinal?: number | string | null;
  weightInitial?: number | string | null;
  weightFinal?: number | string | null;
  discountType?: number | string | null;
  discountTypeValue?: number | string | null;
  active?: boolean | string | number | null;
};

type NormalizedCampaignRow = {
  campaignCode: string;
  campaignDescription: string;
  active: boolean;
  customerDocInitial: string | null;
  customerDocFinal: string | null;
  representativeDocInitial: string | null;
  representativeDocFinal: string | null;
  orderTypeCodeInitial: string | null;
  orderTypeCodeFinal: string | null;
  priceTableCodeInitial: string | null;
  priceTableCodeFinal: string | null;
  commercialFamilyCodeInitial: string | null;
  commercialFamilyCodeFinal: string | null;
  itemCodeInitial: string | null;
  itemCodeFinal: string | null;
  paymentConditionCodeInitial: string | null;
  paymentConditionCodeFinal: string | null;
  quantityInitial: number | null;
  quantityFinal: number | null;
  valueInitial: number | null;
  valueFinal: number | null;
  weightInitial: number | null;
  weightFinal: number | null;
  discountType: number;
  discountTypeValue: number;
};

function parseCampaignCode(payload: BulkCampaignPayload): string | null {
  const code = parseInteger(payload?.campaignCode ?? payload?.codCampanha ?? null);
  return code && code > 0 ? String(code) : null;
}

function parseOrderCode(value: unknown): string | null {
  const parsed = parseInteger(value);
  return parsed && parsed > 0 ? String(parsed) : null;
}

function parseActive(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return true;
  return !['0', 'false', 'nao', 'não', 'n'].includes(text);
}

function normalizeDocRange(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;

  const digits = normalizeDoc(text);
  if (digits) return digits;

  // The Progress source uses ZZZ... as an open-ended upper bound for doc ranges.
  if (/^z+$/i.test(text)) {
    return '9'.repeat(Math.min(text.length, 20));
  }

  return null;
}

function asNullableText(value: string | null | undefined): string | null {
  return value ? value : null;
}

function mergeText(current: string | null, incoming: string | null): string | null {
  if (!incoming) return current;
  return incoming;
}

function mergeNumber(current: number | null, incoming: number | null): number | null {
  if (incoming === null || incoming === undefined) return current;
  return incoming;
}

function normalizePayloadRow(payload: BulkCampaignPayload, campaignCode: string, campaignDescription: string): NormalizedCampaignRow {
  return {
    campaignCode,
    campaignDescription,
    active: parseActive(payload?.active),
    customerDocInitial: normalizeDocRange(payload?.customerDocInitial),
    customerDocFinal: normalizeDocRange(payload?.customerDocFinal),
    representativeDocInitial: normalizeDocRange(payload?.representativeDocInitial),
    representativeDocFinal: normalizeDocRange(payload?.representativeDocFinal),
    orderTypeCodeInitial: asNullableText(parseOrderCode(payload?.orderTypeCodeInitial)),
    orderTypeCodeFinal: asNullableText(parseOrderCode(payload?.orderTypeCodeFinal)),
    priceTableCodeInitial: asNullableText(normalizeText(payload?.priceTableCodeInitial, 20)),
    priceTableCodeFinal: asNullableText(normalizeText(payload?.priceTableCodeFinal, 20)),
    commercialFamilyCodeInitial: asNullableText(normalizeText(payload?.commercialFamilyCodeInitial, 20)),
    commercialFamilyCodeFinal: asNullableText(normalizeText(payload?.commercialFamilyCodeFinal, 20)),
    itemCodeInitial: asNullableText(normalizeText(payload?.itemCodeInitial, 50)),
    itemCodeFinal: asNullableText(normalizeText(payload?.itemCodeFinal, 50)),
    paymentConditionCodeInitial: asNullableText(parseOrderCode(payload?.paymentConditionCodeInitial)),
    paymentConditionCodeFinal: asNullableText(parseOrderCode(payload?.paymentConditionCodeFinal)),
    quantityInitial: parseInteger(payload?.quantityInitial),
    quantityFinal: parseInteger(payload?.quantityFinal),
    valueInitial: parseMoneyValue(payload?.valueInitial),
    valueFinal: parseMoneyValue(payload?.valueFinal),
    weightInitial: parseMoneyValue(payload?.weightInitial),
    weightFinal: parseMoneyValue(payload?.weightFinal),
    discountType: parseInteger(payload?.discountType) ?? 1,
    discountTypeValue: parseMoneyValue(payload?.discountTypeValue) ?? 0,
  };
}

function mergeCampaignRows(current: NormalizedCampaignRow, incoming: NormalizedCampaignRow): NormalizedCampaignRow {
  return {
    campaignCode: current.campaignCode,
    campaignDescription: incoming.campaignDescription || current.campaignDescription,
    active: incoming.active,
    customerDocInitial: mergeText(current.customerDocInitial, incoming.customerDocInitial),
    customerDocFinal: mergeText(current.customerDocFinal, incoming.customerDocFinal),
    representativeDocInitial: mergeText(current.representativeDocInitial, incoming.representativeDocInitial),
    representativeDocFinal: mergeText(current.representativeDocFinal, incoming.representativeDocFinal),
    orderTypeCodeInitial: mergeText(current.orderTypeCodeInitial, incoming.orderTypeCodeInitial),
    orderTypeCodeFinal: mergeText(current.orderTypeCodeFinal, incoming.orderTypeCodeFinal),
    priceTableCodeInitial: mergeText(current.priceTableCodeInitial, incoming.priceTableCodeInitial),
    priceTableCodeFinal: mergeText(current.priceTableCodeFinal, incoming.priceTableCodeFinal),
    commercialFamilyCodeInitial: mergeText(current.commercialFamilyCodeInitial, incoming.commercialFamilyCodeInitial),
    commercialFamilyCodeFinal: mergeText(current.commercialFamilyCodeFinal, incoming.commercialFamilyCodeFinal),
    itemCodeInitial: mergeText(current.itemCodeInitial, incoming.itemCodeInitial),
    itemCodeFinal: mergeText(current.itemCodeFinal, incoming.itemCodeFinal),
    paymentConditionCodeInitial: mergeText(current.paymentConditionCodeInitial, incoming.paymentConditionCodeInitial),
    paymentConditionCodeFinal: mergeText(current.paymentConditionCodeFinal, incoming.paymentConditionCodeFinal),
    quantityInitial: mergeNumber(current.quantityInitial, incoming.quantityInitial),
    quantityFinal: mergeNumber(current.quantityFinal, incoming.quantityFinal),
    valueInitial: mergeNumber(current.valueInitial, incoming.valueInitial),
    valueFinal: mergeNumber(current.valueFinal, incoming.valueFinal),
    weightInitial: mergeNumber(current.weightInitial, incoming.weightInitial),
    weightFinal: mergeNumber(current.weightFinal, incoming.weightFinal),
    discountType: incoming.discountType,
    discountTypeValue: incoming.discountTypeValue,
  };
}

export async function POST(request: Request) {
  try {
    await ensurePromotionalCampaignTable();

    const body = await request.json().catch(() => ({} as any));
    if (!Array.isArray(body?.campaigns)) {
      return NextResponse.json({ error: 'campaigns é obrigatório e deve ser um array' }, { status: 400 });
    }

    const campaigns = body.campaigns as BulkCampaignPayload[];
    const normalizedRows = new Map<string, NormalizedCampaignRow>();

    for (const payload of campaigns) {
      const campaignCode = parseCampaignCode(payload);
      const campaignDescription = normalizeText(payload?.campaignDescription ?? payload?.descCampanha, 120);

      if (!campaignCode) {
        return NextResponse.json({ error: 'campaignCode/codCampanha é obrigatório para todas as campanhas' }, { status: 400 });
      }
      if (!campaignDescription) {
        return NextResponse.json({ error: `campaignDescription/descCampanha é obrigatório para a campanha ${campaignCode}` }, { status: 400 });
      }

      const incomingRow = normalizePayloadRow(payload, campaignCode, campaignDescription);
      const existingRow = normalizedRows.get(campaignCode);
      normalizedRows.set(campaignCode, existingRow ? mergeCampaignRows(existingRow, incomingRow) : incomingRow);
    }

    const rows = Array.from(normalizedRows.values());

    await prisma.$transaction(async (tx) => {
      await tx.promotionalCampaign.deleteMany({});
      if (rows.length > 0) {
        await tx.promotionalCampaign.createMany({
          data: rows,
        });
      }
    });

    return NextResponse.json({
      replaced: true,
      count: rows.length,
      campaignCodes: rows.map((row) => row.campaignCode),
    });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
