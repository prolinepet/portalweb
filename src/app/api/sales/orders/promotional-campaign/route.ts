import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import { getBestPromotionalCampaignForOrder } from '../../../../../lib/promotional-campaigns';

type PreviewOrderItemPayload = {
  quantity?: number | null;
  unitPrice?: number | null;
  discountPct?: number | null;
  discountValue?: number | null;
  width?: number | null;
  length?: number | null;
  grammage?: number | null;
  sku?: string | null;
  inventoryItem?: {
    id?: number | null;
    unitWeightKg?: number | null;
    commercialFamilyId?: number | null;
    commercialFamily?: {
      id?: number | null;
      erpCode?: string | null;
      priceBy?: string | null;
    } | null;
  } | null;
} | null;

type PreviewOrderPayload = {
  customerDoc?: string | null;
  paymentTerms?: string | null;
  customerId?: number | null;
  clientId?: number | null;
  orderTypeId?: number | null;
  orderType?: {
    codtipoped?: number | null;
  } | null;
  items?: PreviewOrderItemPayload[] | null;
};

function toNumberOrNull(value: unknown): number | null {
  const num = typeof value === 'string' ? Number(value.trim().replace(',', '.')) : Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeItems(items: PreviewOrderItemPayload[] | null | undefined) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    quantity: toNumberOrNull(item?.quantity),
    unitPrice: toNumberOrNull(item?.unitPrice),
    discountPct: toNumberOrNull(item?.discountPct),
    discountValue: toNumberOrNull(item?.discountValue),
    width: toNumberOrNull(item?.width),
    length: toNumberOrNull(item?.length),
    grammage: toNumberOrNull(item?.grammage),
    sku: item?.sku ? String(item.sku) : null,
    inventoryItem: item?.inventoryItem
      ? {
          id: toNumberOrNull(item.inventoryItem.id),
          unitWeightKg: toNumberOrNull(item.inventoryItem.unitWeightKg),
          commercialFamilyId: toNumberOrNull(item.inventoryItem.commercialFamilyId),
          commercialFamily: item.inventoryItem.commercialFamily
            ? {
                id: toNumberOrNull(item.inventoryItem.commercialFamily.id),
                erpCode: item.inventoryItem.commercialFamily.erpCode
                  ? String(item.inventoryItem.commercialFamily.erpCode)
                  : null,
                priceBy: item.inventoryItem.commercialFamily.priceBy
                  ? String(item.inventoryItem.commercialFamily.priceBy)
                  : null,
              }
            : null,
        }
      : null,
  }));
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user ? Number((session.user as any).id) : null;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json().catch(() => null)) as PreviewOrderPayload | null;
    if (!body) return NextResponse.json({ promotionalCampaign: null });

    const promotionalCampaign = await getBestPromotionalCampaignForOrder({
      customerDoc: body.customerDoc ?? null,
      paymentTerms: body.paymentTerms ?? null,
      clientId: toNumberOrNull(body.clientId ?? body.customerId),
      orderTypeId: toNumberOrNull(body.orderTypeId),
      orderType: {
        codtipoped: toNumberOrNull(body.orderType?.codtipoped),
      },
      createdBy: {
        doc: (session?.user as any)?.doc ?? null,
      },
      items: normalizeItems(body.items),
    });

    return NextResponse.json({ promotionalCampaign });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
