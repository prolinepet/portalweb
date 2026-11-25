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

export async function POST(request: Request) {
  try {
    await ensurePromotionalCampaignTable();

    const body = await request.json().catch(() => ({} as any));
    if (!Array.isArray(body?.campaigns)) {
      return NextResponse.json({ error: 'campaigns é obrigatório e deve ser um array' }, { status: 400 });
    }

    const campaigns = body.campaigns as BulkCampaignPayload[];
    const normalizedRows = new Map<string, any>();

    for (const payload of campaigns) {
      const campaignCode = parseCampaignCode(payload);
      const campaignDescription = normalizeText(payload?.campaignDescription ?? payload?.descCampanha, 120);

      if (!campaignCode) {
        return NextResponse.json({ error: 'campaignCode/codCampanha é obrigatório para todas as campanhas' }, { status: 400 });
      }
      if (!campaignDescription) {
        return NextResponse.json({ error: `campaignDescription/descCampanha é obrigatório para a campanha ${campaignCode}` }, { status: 400 });
      }

      normalizedRows.set(campaignCode, {
        campaignCode,
        campaignDescription,
        active: parseActive(payload?.active),
        customerDocInitial: normalizeDoc(payload?.customerDocInitial ?? ''),
        customerDocFinal: normalizeDoc(payload?.customerDocFinal ?? ''),
        representativeDocInitial: normalizeDoc(payload?.representativeDocInitial ?? ''),
        representativeDocFinal: normalizeDoc(payload?.representativeDocFinal ?? ''),
        orderTypeCodeInitial: parseOrderCode(payload?.orderTypeCodeInitial),
        orderTypeCodeFinal: parseOrderCode(payload?.orderTypeCodeFinal),
        priceTableCodeInitial: normalizeText(payload?.priceTableCodeInitial, 20),
        priceTableCodeFinal: normalizeText(payload?.priceTableCodeFinal, 20),
        commercialFamilyCodeInitial: normalizeText(payload?.commercialFamilyCodeInitial, 20),
        commercialFamilyCodeFinal: normalizeText(payload?.commercialFamilyCodeFinal, 20),
        itemCodeInitial: normalizeText(payload?.itemCodeInitial, 50),
        itemCodeFinal: normalizeText(payload?.itemCodeFinal, 50),
        paymentConditionCodeInitial: parseOrderCode(payload?.paymentConditionCodeInitial),
        paymentConditionCodeFinal: parseOrderCode(payload?.paymentConditionCodeFinal),
        quantityInitial: parseInteger(payload?.quantityInitial),
        quantityFinal: parseInteger(payload?.quantityFinal),
        valueInitial: parseMoneyValue(payload?.valueInitial),
        valueFinal: parseMoneyValue(payload?.valueFinal),
        weightInitial: parseMoneyValue(payload?.weightInitial),
        weightFinal: parseMoneyValue(payload?.weightFinal),
        discountType: parseInteger(payload?.discountType) ?? 1,
        discountTypeValue: parseMoneyValue(payload?.discountTypeValue) ?? 0,
      });
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
