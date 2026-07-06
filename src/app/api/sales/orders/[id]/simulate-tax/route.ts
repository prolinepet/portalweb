import { NextResponse } from 'next/server';
import { prisma } from '../../../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../../lib/auth';

function formatDiscountPct(v: any): string {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : '0';
}

function formatDiscountValue(v: any): string {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : '0';
}

function translateErrorSubType(v: any): string {
  const s = String(v || '').trim().toUpperCase();
  if (s === 'ERROR') return 'ERRO';
  if (s === 'INFORMATION' || s === 'INFO') return 'INFORMAÇÃO';
  if (s === 'WARNING' || s === 'WARN') return 'AVISO';
  return s || 'ERRO';
}

function extractMessages(data: any): string[] {
  const msgs: string[] = [];
  const pushFrom = (obj: any) => {
    if (!obj || typeof obj !== 'object') return;
    if (obj.ErrorSubType || obj.ErrorDescription) {
      const label = translateErrorSubType(obj.ErrorSubType);
      const desc = String(obj.ErrorDescription || '').trim();
      msgs.push(`${label}: ${desc || '-'}`);
    }
  };

  if (Array.isArray(data)) {
    for (const it of data) pushFrom(it);
    return msgs;
  }

  pushFrom(data);
  if (Array.isArray(data?.RowErrors)) {
    for (const it of data.RowErrors) pushFrom(it);
  }
  return msgs;
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user ? Number((session.user as any).id) : null;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Fetch user settings for integration mode
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { erpIntegrationMode: true }
    });
    const integrationRoute = user?.erpIntegrationMode === 'PROD' ? 'prd' : 'tst';

    const id = Number(params.id);
    
    // Fetch order with related data
    const order = await prisma.salesOrder.findUnique({
      where: { id },
      include: {
        entity: true,
        client: true,
        items: {
          include: {
            inventoryItem: true
          }
        }
      }
    });

    if (!order) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    const customerDocRaw = order.client?.doc || order.customerDoc || '';

    let entityDoc = (order.entity?.cnpj || '').replace(/\D/g, '');
    let effectiveEntityId: number | null = (order as any)?.entityId != null ? Number((order as any).entityId) : null;
    const sessionEntityIdRaw = (session as any)?.entityId ?? (session as any)?.activeEntityId ?? null;
    const sessionEntityId = sessionEntityIdRaw ? Number(sessionEntityIdRaw) : null;
    if ((!entityDoc || !effectiveEntityId) && sessionEntityId && Number.isFinite(sessionEntityId) && sessionEntityId > 0) {
         const entity = await prisma.entity.findUnique({ where: { id: Math.trunc(sessionEntityId) } });
         if (entity) {
           entityDoc = (entity.cnpj || '').replace(/\D/g, '');
           effectiveEntityId = entity.id;
         }
    }
    if ((!entityDoc || !effectiveEntityId) && userId) {
        const userLast = await prisma.user.findUnique({
            where: { id: userId },
            select: { lastEntityId: true }
        });
        if (userLast?.lastEntityId) {
             const entity = await prisma.entity.findUnique({ where: { id: userLast.lastEntityId } });
             if (entity) {
               entityDoc = (entity.cnpj || '').replace(/\D/g, '');
               effectiveEntityId = entity.id;
             }
        } else {
             const links = await prisma.userEntity.findMany({ where: { userId }, select: { entityId: true }, take: 2 });
             if (links.length === 1 && links[0]?.entityId) {
               const entity = await prisma.entity.findUnique({ where: { id: links[0].entityId } });
               if (entity) {
                 entityDoc = (entity.cnpj || '').replace(/\D/g, '');
                 effectiveEntityId = entity.id;
                 await prisma.user.update({ where: { id: userId }, data: { lastEntityId: entity.id } }).catch(() => {});
               }
             }
        }
    }
    if (effectiveEntityId && (!order.entityId || !Number.isFinite(Number(order.entityId)))) {
      await prisma.salesOrder.update({ where: { id: order.id }, data: { entityId: Math.trunc(effectiveEntityId) } }).catch(() => {});
    }

    if (!customerDocRaw) return NextResponse.json({ error: 'CNPJ do cliente não encontrado.' }, { status: 400 });
    if (!entityDoc) return NextResponse.json({ error: 'Representante (Entidade) não identificado no pedido.' }, { status: 400 });

    const invIds = Array.from(
      new Set(
        (order.items || [])
          .map((it: any) => Number(it?.inventoryItemId ?? it?.inventoryItem?.id))
          .filter((n: any) => Number.isFinite(n) && n > 0)
      )
    );
    const clientId = (order as any)?.clientId != null ? Number((order as any).clientId) : (order as any)?.client?.id != null ? Number((order as any).client?.id) : null;
    const orderTypeId = (order as any)?.orderTypeId != null ? Number((order as any).orderTypeId) : null;
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

    // Extract Payment Terms Code (assuming format "[code] description")
    let paymentTermsErp = 30; // Default
    if (isFreePaymentTermsOrderType) {
      paymentTermsErp = 0;
    } else {
      if (!order.paymentTerms) {
        return NextResponse.json({ error: 'Condição de Pagamento não informada. Por favor, selecione uma condição de pagamento.' }, { status: 400 });
      }
      const match = String(order.paymentTerms || '').match(/^\[(\d+)\]/);
      if (match && match[1]) {
        paymentTermsErp = parseInt(match[1], 10);
      } else {
        const term = await prisma.paymentTerm.findFirst({
          where: { description: { equals: String(order.paymentTerms || '').trim() } }
        });
        if (term?.code) paymentTermsErp = term.code;
      }
    }
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
          id: order.id,
          code: order.code,
          customerDoc: customerDocRaw.replace(/\D/g, ''),
          discountOrd: "0",
          deliveryDate: order.deliveryDate ? order.deliveryDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          observ: order.notes || "Simulação via Portal",
          entityDoc: entityDoc
        },
        orderitem: order.items.map(item => ({
          priceTableId: (() => {
            const invId = Number((item as any)?.inventoryItemId ?? (item as any)?.inventoryItem?.id);
            const pt = Number.isFinite(invId) && invId > 0 ? priceTableByInvId.get(invId) : null;
            return pt?.id ?? 0;
          })(),
          priceTableCode: (() => {
            const invId = Number((item as any)?.inventoryItemId ?? (item as any)?.inventoryItem?.id);
            const pt = Number.isFinite(invId) && invId > 0 ? priceTableByInvId.get(invId) : null;
            return pt?.nrtabpre ?? "";
          })(),
          orderId: order.id,
          sku: item.sku || item.inventoryItem?.sku || "",
          quantity: item.quantity,
          discountPct: formatDiscountPct((item as any)?.discountPct),
          discountOrd: formatDiscountPct((item as any)?.discountPct),
          discountValue: formatDiscountValue((item as any)?.discountValue),
          clientOrderNumber: item.clientOrderNumber || "",
          clientOrderItemNumber: item.clientOrderItemNumber || 0,
          deliveryDate: item.itemDeliveryDate ? item.itemDeliveryDate.toISOString().split('T')[0] : "",
          externalResin: item.externalResin ? "S" : "N",
          internalResin: item.internalResin ? "S" : "N"
        }))
      }
    };

    console.log('Simulate Tax Payload:', JSON.stringify(payload, null, 2));

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
      let parsed: any = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = null;
      }
      const messages = extractMessages(parsed);
      console.error('External API Error:', text);
      return NextResponse.json(
        {
          error: `Erro na API externa: ${response.status} - ${text}`,
          messages,
          payloadSent: payload,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    const messages = extractMessages(data);

    // Parse total with tax from response
    let totalWithTax = 0;
    if (data && data.vltotcomimp !== undefined) {
      totalWithTax = Number(data.vltotcomimp);
    }

    // Atualizar timestamp da última simulação e total com impostos
    await prisma.salesOrder.update({
      where: { id: order.id },
      data: { 
        lastTaxSimulation: new Date(),
        totalWithTax: totalWithTax
      }
    });

    if (Array.isArray(data)) return NextResponse.json({ rows: data, messages });
    if (data && typeof data === 'object') return NextResponse.json({ ...data, messages });
    return NextResponse.json({ data, messages });

  } catch (err: any) {
    console.error('Simulate Tax Error:', err);
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
