import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';

function computeDiscountOrdPct(items: any[]): string {
  const list = Array.isArray(items) ? items : [];
  let subtotal = 0;
  let discount = 0;
  for (const it of list) {
    const qty = Number((it as any)?.quantity ?? 0);
    const unitPrice = Number((it as any)?.unitPrice ?? 0);
    const pct = Number((it as any)?.discountPct ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) continue;
    const line = qty * unitPrice;
    subtotal += line;
    if (Number.isFinite(pct) && pct > 0) discount += line * (pct / 100);
  }
  const pct = subtotal > 0 ? (discount / subtotal) * 100 : 0;
  return Number.isFinite(pct) && pct > 0 ? pct.toFixed(2) : '0';
}

function formatDiscountPct(v: any): string {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : '0';
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user ? Number((session.user as any).id) : null;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { 
        customerDoc,
        paymentTerms,
        deliveryDate,
        items,
        notes
    } = body || {};

    if (!items || !Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ error: 'Itens são obrigatórios' }, { status: 400 });
    }

    // Fetch user settings for integration mode and entity
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { erpIntegrationMode: true, lastEntityId: true }
    });
    const integrationRoute = user?.erpIntegrationMode === 'PROD' ? 'prd' : 'tst';
    
    // Fetch Entity for entityDoc
    let entityDoc = '';
    const sessionEntityIdRaw = (session as any)?.entityId ?? (session as any)?.activeEntityId ?? null;
    const sessionEntityId = sessionEntityIdRaw ? Number(sessionEntityIdRaw) : null;
    if (sessionEntityId && Number.isFinite(sessionEntityId) && sessionEntityId > 0) {
        const entity = await prisma.entity.findUnique({
            where: { id: Math.trunc(sessionEntityId) },
            select: { cnpj: true }
        });
        entityDoc = (entity?.cnpj || '').replace(/\D/g, '');
    } else if (user?.lastEntityId) {
        const entity = await prisma.entity.findUnique({
            where: { id: user.lastEntityId },
            select: { cnpj: true }
        });
        entityDoc = (entity?.cnpj || '').replace(/\D/g, '');
    } else {
        const links = await prisma.userEntity.findMany({
          where: { userId },
          select: { entityId: true },
          take: 2
        });
        if (links.length === 1 && links[0]?.entityId) {
          const entity = await prisma.entity.findUnique({
            where: { id: links[0].entityId },
            select: { id: true, cnpj: true }
          });
          if (entity?.cnpj) {
            entityDoc = String(entity.cnpj || '').replace(/\D/g, '');
            await prisma.user.update({ where: { id: userId }, data: { lastEntityId: entity.id } }).catch(() => {});
          }
        }
    }

    const customerDocRaw = customerDoc || '';

    if (!customerDocRaw) return NextResponse.json({ error: 'CNPJ do cliente não encontrado.' }, { status: 400 });
    if (!entityDoc) return NextResponse.json({ error: 'Representante (Entidade) não identificado.' }, { status: 400 });

    const clientId = body?.customerId != null ? Number(body.customerId) : body?.clientId != null ? Number(body.clientId) : null;
    const orderTypeId = body?.orderTypeId != null ? Number(body.orderTypeId) : null;
    let salesChannel = 1;
    let isFreePaymentTermsOrderType = false;
    if (orderTypeId && Number.isFinite(orderTypeId) && orderTypeId > 0) {
      const ot = await prisma.orderType.findUnique({
        where: { id: Math.trunc(orderTypeId) },
        select: { codtipoped: true, kind: true },
      });
      const ch = Number((ot as any)?.codtipoped);
      if (Number.isFinite(ch) && ch > 0) salesChannel = Math.trunc(ch);
      const k = String((ot as any)?.kind || '').trim().toUpperCase();
      isFreePaymentTermsOrderType = k === 'BONIFICACAO' || k === 'AMOSTRA';
    }

    let paymentTermsErp = 30;
    if (isFreePaymentTermsOrderType) {
      paymentTermsErp = 0;
    } else {
      if (!paymentTerms) {
        return NextResponse.json({ error: 'Condição de Pagamento não informada. Por favor, selecione uma condição de pagamento.' }, { status: 400 });
      }
      const match = String(paymentTerms || '').match(/^\[(\d+)\]/);
      if (match && match[1]) {
        paymentTermsErp = parseInt(match[1], 10);
      } else {
        const term = await prisma.paymentTerm.findFirst({
          where: { description: { equals: String(paymentTerms || '').trim() } }
        });
        if (term?.code) paymentTermsErp = term.code;
      }
    }
    const invIds = Array.from(
      new Set(
        (items || [])
          .map((it: any) => Number(it?.inventoryItemId ?? it?.inventoryItem?.id))
          .filter((n: any) => Number.isFinite(n) && n > 0)
      )
    );
    const priceTableByInvId = new Map<number, { id: number; nrtabpre: string; descricao: string }>();
    if (clientId && Number.isFinite(clientId) && clientId > 0 && orderTypeId && Number.isFinite(orderTypeId) && orderTypeId > 0 && invIds.length > 0) {
      const [clientLinks, typeLinks] = await Promise.all([
        prisma.clientPriceTable.findMany({ where: { clientId: Math.trunc(clientId) }, select: { priceTableId: true } }),
        prisma.orderTypePriceTable.findMany({ where: { orderTypeId: Math.trunc(orderTypeId) }, select: { priceTableId: true } }),
      ]);
      const clientPtIds = new Set(clientLinks.map((l) => Number(l.priceTableId)));
      const allowedPtIds = Array.from(
        new Set(typeLinks.map((l) => Number(l.priceTableId)).filter((id) => clientPtIds.has(id)))
      ).filter((n) => Number.isFinite(n) && n > 0);
      if (allowedPtIds.length > 0) {
        const rows = await prisma.priceTableItem.findMany({
          where: { priceTableId: { in: allowedPtIds }, inventoryItemId: { in: invIds } },
          select: {
            inventoryItemId: true,
            priceTableId: true,
            unitPrice: true,
            priceTable: { select: { id: true, nrtabpre: true, descricao: true } },
          },
        });
        const bestByInvId = new Map<number, { unitPrice: number; priceTable: { id: number; nrtabpre: string; descricao: string } }>();
        for (const r of rows) {
          const invId = Number((r as any)?.inventoryItemId);
          if (!Number.isFinite(invId) || invId <= 0) continue;
          const unitPrice = Number((r as any)?.unitPrice ?? 0);
          const existing = bestByInvId.get(invId);
          const pt = (r as any)?.priceTable;
          const ptId = Number((r as any)?.priceTableId);
          const exPtId = Number((existing as any)?.priceTable?.id);
          const shouldReplace =
            !existing ||
            unitPrice < existing.unitPrice ||
            (unitPrice === existing.unitPrice &&
              Number.isFinite(ptId) &&
              ptId > 0 &&
              (!Number.isFinite(exPtId) || exPtId <= 0 || ptId < exPtId));
          if (shouldReplace && pt && typeof pt === 'object') bestByInvId.set(invId, { unitPrice, priceTable: pt });
        }
        for (const [k, v] of bestByInvId.entries()) {
          if (v?.priceTable?.id) priceTableByInvId.set(k, v.priceTable);
        }
      }
    }

    // Construct Payload
    // Note: Since the order is not saved, we use 0 or dummy values for IDs
    const payload = {
      route: integrationRoute,
      module: "mpd",
      version: "v1",
      resource: "simulaImpPedido",
      method: "POST",
      params: {
        order: {
          salesChannel: salesChannel,
          paymentTermsErp: paymentTermsErp,
          branchId: "01",
          id: 0, // No ID yet
          code: "SIMULACAO", // Dummy code
          customerDoc: customerDocRaw.replace(/\D/g, ''),
          discountOrd: "0",
          deliveryDate: deliveryDate ? new Date(deliveryDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          observ: notes || "Simulação via Portal (Novo Pedido)",
          entityDoc: entityDoc
        },
        orderitem: items.map((item: any) => ({
          priceTableId: (() => {
            const invId = Number(item?.inventoryItemId ?? item?.inventoryItem?.id);
            const pt = Number.isFinite(invId) && invId > 0 ? priceTableByInvId.get(invId) : null;
            const fallback = item?.inventoryItem?.priceTable;
            if (pt?.id) return pt.id;
            const fbId = Number(fallback?.id);
            return Number.isFinite(fbId) && fbId > 0 ? fbId : 0;
          })(),
          priceTableCode: (() => {
            const invId = Number(item?.inventoryItemId ?? item?.inventoryItem?.id);
            const pt = Number.isFinite(invId) && invId > 0 ? priceTableByInvId.get(invId) : null;
            const fallback = item?.inventoryItem?.priceTable;
            if (pt?.nrtabpre) return String(pt.nrtabpre);
            const fb = String(fallback?.nrtabpre || '').trim();
            return fb;
          })(),
          orderId: 0,
          sku: item.sku || item.inventoryItem?.sku || "",
          quantity: item.quantity,
          discountPct: formatDiscountPct(item.discountPct),
          discountOrd: formatDiscountPct(item.discountPct),
          clientOrderNumber: item.clientOrderNumber || "",
          clientOrderItemNumber: item.clientOrderItemNumber || 0,
          deliveryDate: item.itemDeliveryDate ? new Date(item.itemDeliveryDate).toISOString().split('T')[0] : "",
          externalResin: item.externalResin ? "S" : "N",
          internalResin: item.internalResin ? "S" : "N"
        }))
      }
    };

    console.log('Simulate Tax Payload (New Order):', JSON.stringify(payload, null, 2));

    // Get ERP URL from settings
    const erpSetting = await prisma.systemSetting.findUnique({
      where: { key: 'erpUrl' }
    });
    const erpUrl = erpSetting?.value || 'http://cvserver13:8484';
    const apiUrl = erpUrl.endsWith('/') ? `${erpUrl}apiIntegrTotvsDts/` : `${erpUrl}/apiIntegrTotvsDts/`;

    // Call External API
    let response: Response;
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json; charset=UTF-8'
        },
        body: JSON.stringify(payload)
      });
    } catch (e: any) {
      const msg = e?.message || String(e);
      return NextResponse.json(
        { error: `Falha ao conectar na API do ERP (${apiUrl}). Verifique a configuração em Configurações > URL do ERP. Detalhe: ${msg}` },
        { status: 500 }
      );
    }

    if (!response.ok) {
        const text = await response.text();
        console.error('External API Error:', text);
        return NextResponse.json({ 
            error: `Erro na API externa: ${response.status} - ${text}`,
            payloadSent: payload
        }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (err: any) {
    console.error('Simulate Tax Error:', err);
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
