"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type InventoryItem = {
  id: number;
  sku?: string | null;
  name: string;
  unit?: string | null;
  commercialFamily?: { id: number; description?: string | null; name?: string | null; priceBy?: string | null } | null;
  unitPrice?: number | null;
  priceTable?: { id: number; nrtabpre: string; descricao: string } | null;
  unitWeightKg?: number | null;
  width?: number | null;
  length?: number | null;
  grammage?: number | null;
};

type OrderType = { id: number; codtipoped: number; kind?: 'VENDA' | 'BONIFICACAO' | 'AMOSTRA' | null; descricao: string; situacao: number };

type OrderItem = {
  id: number;
  name: string;
  sku?: string | null;
  unit?: string | null;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  discountValue: number;
  width?: number | null;
  length?: number | null;
  grammage?: number | null;
  diameter?: number | null;
  tube?: number | null;
  inventoryItem?: InventoryItem | null;
  clientOrderNumber?: string | null;
  clientOrderItemNumber?: number | null;
  itemDeliveryDate?: string | Date | null;
  internalResin?: boolean;
  externalResin?: boolean;
  creases?: Record<string, number> | null;
};

type SalesOrder = {
  id: number;
  code: string;
  status: string;
  orderDate: string;
  customerName: string;
  customerId?: number;
  customerDoc?: string | null;
  orderTypeId?: number | null;
  triangularCustomerName?: string | null;
  triangularCustomerDoc?: string | null;
  paymentTerms?: string | null;
  deliveryDate?: string | null;
  notes?: string | null;
  subtotal: number;
  discountTotal: number;
  total: number;
  items?: OrderItem[];
};

import { SalesOrderItemCard, SalesOrderItemRow, supportsSheetDims, supportsCoreDims } from "../components/SalesOrderItemRow";

const ICON_BTN = "inline-flex items-center justify-center w-8 h-8 bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-50 text-gray-700";

function familyName(it: OrderItem): string {
  const cf: any = it.inventoryItem?.commercialFamily;
  let fam = String(cf?.description || cf?.name || '').trim();
  if (!fam) {
    const name = (it.name || '').toUpperCase();
    if (name.includes('CHAPA') || name.includes('CHAPAS')) fam = 'CHAPAS';
    else if (name.includes('MIOL')) fam = 'MIOLO';
    else fam = 'Outras famílias';
  }
  return fam.toUpperCase();
}

// Helpers imported from components/SalesOrderItemRow

function statusChipStyle(): string {
  return 'bg-gray-100 text-gray-800 border border-gray-300';
}

function statusLabelPt(): string {
  return 'Novo';
}

const minChars = 1;

const AsyncSelect = ({ 
  label, 
  value, 
  onChange, 
  onSelectObj,
  fetchUrl, 
  placeholder,
  renderOption,
  getLabel
}: { 
  label: string; 
  value: string; 
  onChange: (val: string) => void;
  onSelectObj?: (obj: any) => void;
  fetchUrl: (q: string) => string; 
  placeholder?: string;
  renderOption: (item: any) => React.ReactNode;
  getLabel: (item: any) => string;
}) => {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<any[]>([]);
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = async (q: string) => {
    onChange(q);
    if (q.length < minChars) { setOpts([]); return; }
    try {
      const res = await fetch(fetchUrl(q));
      if (res.ok) {
        const data = await res.json();
        setOpts(Array.isArray(data) ? data : []);
        setOpen(true);
      }
    } catch { }
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <span className="text-gray-600">{label}</span>
      <input 
        className="mt-1 w-full px-2 py-1 border rounded" 
        value={value} 
        onChange={(e) => handleSearch(e.target.value)}
        onFocus={() => { 
           if (value.length >= minChars && opts.length === 0) {
             handleSearch(value);
           }
           setOpen(true); 
        }}
        placeholder={placeholder}
      />
      {open && opts.length > 0 && (
        <ul className="absolute z-50 w-full bg-white border rounded shadow-lg max-h-60 overflow-auto mt-1">
          {opts.map((item, idx) => (
            <li 
              key={idx} 
              className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
              onClick={() => {
                const txt = getLabel(item);
                onChange(txt);
                if (onSelectObj) onSelectObj(item);
                setOpen(false);
              }}
            >
              {renderOption(item)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

function NewSalesOrderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerIdParam = searchParams?.get('customerId');
  const copyFromParam = searchParams?.get('copyFrom');
  
  // Initial empty order
  const [order, setOrder] = useState<Partial<SalesOrder>>({
    status: 'OPEN',
    orderDate: new Date().toISOString(),
    customerName: '',
    customerId: undefined,
    paymentTerms: '',
    deliveryDate: '',
    orderTypeId: null,
    items: [],
    subtotal: 0,
    discountTotal: 0,
    total: 0
  });

  const [loading, setLoading] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [linkedOrderTypes, setLinkedOrderTypes] = useState<OrderType[]>([]);
  const [linkedOrderTypesLoading, setLinkedOrderTypesLoading] = useState(false);
  const [paymentTermsOptions, setPaymentTermsOptions] = useState<any[]>([]);
  const [paymentTermsLoading, setPaymentTermsLoading] = useState(false);
  const lastOrderTypeIdRef = useRef<number | null>(null);
  const [searchHistItemDiscount, setSearchHistItemDiscount] = useState(false);
  const isCpfCustomer = useMemo(() => {
    const docDigits = String(order.customerDoc || "").replace(/\D/g, "");
    return docDigits.length === 11;
  }, [order.customerDoc]);

  const selectedOrderType = useMemo(() => {
    const oid = order.orderTypeId != null ? Number(order.orderTypeId) : null;
    if (!oid || !Number.isFinite(oid) || oid <= 0) return null;
    return (linkedOrderTypes || []).find((ot) => Number(ot.id) === oid) || null;
  }, [order.orderTypeId, linkedOrderTypes]);

  const isFreePaymentTermsOrderType =
    selectedOrderType?.kind === 'BONIFICACAO' || selectedOrderType?.kind === 'AMOSTRA';

  useEffect(() => {
    if (isFreePaymentTermsOrderType) {
      setOrder((prev) => ({ ...prev, paymentTerms: '' }));
    }
  }, [isFreePaymentTermsOrderType]);

  useEffect(() => {
    lastOrderTypeIdRef.current = order.orderTypeId != null ? Number(order.orderTypeId) : null;
  }, [order.orderTypeId]);

  const paymentTermLabel = useCallback((pt: any): string => {
    const code = pt?.code;
    const desc = pt?.description;
    if (code == null && desc == null) return '';
    if (code == null) return String(desc || '').trim();
    return `[${code}] ${String(desc || '').trim()}`.trim();
  }, []);

  const loadPaymentTermsForClient = useCallback(async (clientId: number) => {
    if (!Number.isFinite(clientId) || clientId <= 0) {
      setPaymentTermsOptions([]);
      setOrder((prev) => ({ ...prev, paymentTerms: '' }));
      return;
    }
    setPaymentTermsLoading(true);
    try {
      const res = await fetch(`/api/base/payment-terms?clientId=${clientId}`, { cache: 'no-store' });
      const data = await res.json().catch(() => []);
      const list = Array.isArray(data) ? data : [];
      setPaymentTermsOptions(list);
      const labels = list.map(paymentTermLabel).filter(Boolean);
      setOrder((prev) => {
        const current = String(prev.paymentTerms || '');
        const stillValid = current && labels.includes(current);
        if (stillValid) return prev;
        return { ...prev, paymentTerms: labels[0] || '' };
      });
    } catch {
      setPaymentTermsOptions([]);
      setOrder((prev) => ({ ...prev, paymentTerms: '' }));
    } finally {
      setPaymentTermsLoading(false);
    }
  }, [paymentTermLabel]);

  const loadLinkedOrderTypesForClient = useCallback(async (clientId: number) => {
    if (!Number.isFinite(clientId) || clientId <= 0) {
      setLinkedOrderTypes([]);
      setOrder((prev) => ({ ...prev, orderTypeId: null }));
      return;
    }
    setLinkedOrderTypesLoading(true);
    try {
      const res = await fetch(`/api/base/clients/${encodeURIComponent(String(clientId))}/order-types`, { cache: 'no-store' });
      const data = await res.json().catch(() => []);
      const list = Array.isArray(data) ? (data as OrderType[]) : [];
      const active = list.filter((ot) => ot && ot.situacao === 1);
      setLinkedOrderTypes(active);
      setOrder((prev) => {
        const current = prev.orderTypeId ?? null;
        const stillValid = current && active.some((ot) => Number(ot.id) === Number(current));
        if (stillValid) return prev;
        if (!current && active.length === 1) return { ...prev, orderTypeId: Number(active[0].id) };
        return { ...prev, orderTypeId: null };
      });
    } catch {
      setLinkedOrderTypes([]);
      setOrder((prev) => ({ ...prev, orderTypeId: null }));
    } finally {
      setLinkedOrderTypesLoading(false);
    }
  }, []);

  const ensureItemsCompatibilityForOrderType = async (nextOrderTypeId: number | null): Promise<{ ok: boolean; nextItems?: OrderItem[] }> => {
    if (!order.customerId) return { ok: true };
    const items = order.items || [];
    if (items.length === 0) return { ok: true };
    if (!nextOrderTypeId) return { ok: true };

    const invIds = Array.from(
      new Set(
        items
          .map((it) => Number(it?.inventoryItem?.id))
          .filter((n) => Number.isFinite(n) && n > 0)
      )
    );
    if (invIds.length === 0) return { ok: true };

    const params = new URLSearchParams();
    params.set('clientId', String(order.customerId));
    params.set('orderTypeId', String(nextOrderTypeId));
    params.set('ids', invIds.join(','));
    const [res, ptRes] = await Promise.all([
      fetch(`/api/items?${params.toString()}`, { cache: 'no-store' }),
      fetch(`/api/base/order-types/${encodeURIComponent(String(Math.trunc(nextOrderTypeId)))}/price-tables`, { cache: 'no-store' })
        .catch(() => null as any),
    ]);
    const arr = await res.json().catch(() => []);
    const allowedList = Array.isArray(arr) ? arr : [];
    let allowedPtSet: Set<number> | null = null;
    try {
      if (ptRes && ptRes.ok) {
        const ptArr = await ptRes.json().catch(() => []);
        allowedPtSet = new Set<number>(
          (Array.isArray(ptArr) ? ptArr : [])
            .map((x: any) => Number(x?.priceTableId))
            .filter((n: any) => Number.isFinite(n) && n > 0)
        );
      }
    } catch {
      allowedPtSet = null;
    }
    const allowedById = new Map<number, any>();
    for (const it of allowedList) {
      const id = Number(it?.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      allowedById.set(id, it);
    }

    const toRemove: OrderItem[] = items.filter((it) => {
      const id = Number(it?.inventoryItem?.id);
      const ptId = Number((it as any)?.inventoryItem?.priceTable?.id);
      const removeByItem = Number.isFinite(id) && id > 0 && !allowedById.has(id);
      const removeByPriceTable =
        allowedPtSet !== null && Number.isFinite(ptId) && ptId > 0 && !allowedPtSet.has(ptId);
      return removeByItem || removeByPriceTable;
    });

    if (toRemove.length > 0) {
      const sample = toRemove
        .slice(0, 8)
        .map((it) => String(it?.sku || it?.inventoryItem?.sku || it?.name || 'Item'))
        .join(', ');
      const msg =
        `Ao alterar o Tipo de pedido, ${toRemove.length} item(ns) não ficarão disponíveis e serão removidos do pedido.\n\n` +
        `Ex.: ${sample}${toRemove.length > 8 ? '...' : ''}\n\n` +
        `Deseja continuar?`;
      const confirmRemove = confirm(msg);
      if (!confirmRemove) return { ok: false };
    }

    const toRemoveIds = new Set<number>(toRemove.map((x) => Number(x.id)).filter((n) => Number.isFinite(n)));
    const nextItems: OrderItem[] = items
      .filter((it) => {
        if (toRemoveIds.has(Number(it.id))) return false;
        const id = Number(it?.inventoryItem?.id);
        return !Number.isFinite(id) || id <= 0 ? true : allowedById.has(id);
      })
      .map((it) => {
        const id = Number(it?.inventoryItem?.id);
        if (!Number.isFinite(id) || id <= 0) return it;
        const allowed = allowedById.get(id);
        const nextUnitPrice = allowed?.unitPrice != null ? Number(allowed.unitPrice) : it.unitPrice;
        const nextInv: InventoryItem | null = allowed && typeof allowed === 'object'
          ? ({ ...(it.inventoryItem || {}), ...(allowed as any) } as InventoryItem)
          : it.inventoryItem ?? null;
        return { ...it, unitPrice: nextUnitPrice, inventoryItem: nextInv };
      });

    return { ok: true, nextItems };
  };
  
  useEffect(() => {
    if (copyFromParam) return;
    if (customerIdParam) {
      fetch(`/api/base/clients?q=${customerIdParam}`)
        .then(r => r.json())
        .then(arr => {
          if (Array.isArray(arr)) {
            const c = arr.find((x: any) => String(x.id) === customerIdParam);
            if (c) {
              setOrder(prev => ({ ...prev, customerName: c.name, customerDoc: c.doc, customerId: c.id, orderTypeId: null }));
              loadPaymentTermsForClient(Number(c.id));
              loadLinkedOrderTypesForClient(Number(c.id));
            }
          }
        })
        .catch(console.error);
    }
  }, [customerIdParam, copyFromParam, loadLinkedOrderTypesForClient, loadPaymentTermsForClient]);

  useEffect(() => {
    if (copyFromParam) return;
    if (!order.customerId) return;
    if (order.orderTypeId) return;
    if (linkedOrderTypesLoading) return;
    if (!Array.isArray(linkedOrderTypes) || linkedOrderTypes.length === 0) return;
    const docDigits = String(order.customerDoc || "").replace(/\D/g, "");
    if (docDigits.length !== 11) return;
    const ot6 = linkedOrderTypes.find((ot) => Number(ot?.codtipoped) === 6);
    if (!ot6?.id) return;
    if (!headerCollapsedTouchedRef.current) {
      setHeaderCollapsed(true);
    }
    setSearchHistItemDiscount(false);
    setOrder((prev) => {
      if (prev.orderTypeId) return prev;
      return { ...prev, orderTypeId: Number(ot6.id) };
    });
  }, [copyFromParam, linkedOrderTypes, linkedOrderTypesLoading, order.customerDoc, order.customerId, order.orderTypeId]);

  useEffect(() => {
    if (!isCpfCustomer) return;
    setSearchHistItemDiscount(false);
  }, [isCpfCustomer]);

  useEffect(() => {
    const copyId = Number(copyFromParam);
    if (!Number.isFinite(copyId) || copyId <= 0) return;

    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/sales/orders/${copyId}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('Falha ao carregar pedido para cópia');
        const src = await res.json();

        const clientId = Number((src as any)?.clientId ?? (src as any)?.customerId ?? 0);
        const srcOrderTypeId = Number((src as any)?.orderTypeId ?? 0);
        const srcItems = Array.isArray((src as any)?.items) ? (src as any).items : [];

        const invIds = Array.from(
          new Set(
            srcItems
              .map((it: any) => Number(it?.inventoryItemId ?? it?.inventoryItem?.id))
              .filter((n: any) => Number.isFinite(n) && n > 0)
          )
        );

        const invById = new Map<number, InventoryItem>();
        if (Number.isFinite(clientId) && clientId > 0 && invIds.length > 0) {
          const params = new URLSearchParams();
          params.set('clientId', String(clientId));
          if (Number.isFinite(srcOrderTypeId) && srcOrderTypeId > 0) {
            params.set('orderTypeId', String(Math.trunc(srcOrderTypeId)));
          }
          params.set('ids', invIds.join(','));
          const itemsRes = await fetch(`/api/items?${params.toString()}`, { cache: 'no-store' });
          if (itemsRes.ok) {
            const arr = await itemsRes.json();
            if (Array.isArray(arr)) {
              for (const it of arr) {
                const id = Number(it?.id);
                if (!Number.isFinite(id) || id <= 0) continue;
                invById.set(id, it as InventoryItem);
              }
            }
          }
        }

        const copiedItems: OrderItem[] = srcItems.map((it: any, idx: number) => {
          const invId = Number(it?.inventoryItemId ?? it?.inventoryItem?.id);
          const inv = Number.isFinite(invId) && invId > 0 ? invById.get(invId) : undefined;
          const unitPrice = inv?.unitPrice != null ? Number(inv.unitPrice) : Number(it?.unitPrice ?? 0);

          const fallbackInv: InventoryItem | null = it?.inventoryItem
            ? (it.inventoryItem as InventoryItem)
            : Number.isFinite(invId) && invId > 0
            ? ({ id: invId, name: String(it?.name || 'Produto') } as InventoryItem)
            : null;

          return {
            id: -Date.now() - idx,
            name: String(it?.name || ''),
            sku: it?.sku ?? null,
            unit: it?.unit ?? null,
            quantity: Number(it?.quantity ?? 1),
            unitPrice,
            discountPct: Number(it?.discountPct ?? 0),
            discountValue: Number(it?.discountValue ?? 0),
            width: it?.width ?? inv?.width ?? null,
            length: it?.length ?? inv?.length ?? null,
            grammage: it?.grammage ?? inv?.grammage ?? null,
            diameter: it?.diameter ?? null,
            tube: it?.tube ?? null,
            inventoryItem: inv ?? fallbackInv,
            clientOrderNumber: it?.clientOrderNumber ?? null,
            clientOrderItemNumber: it?.clientOrderItemNumber ?? null,
            itemDeliveryDate: it?.itemDeliveryDate ?? null,
            internalResin: !!it?.internalResin,
            externalResin: !!it?.externalResin,
            creases: it?.creases ?? null,
          };
        });

        setTotalWithTax(0);
        setOrder({
          status: 'OPEN',
          orderDate: new Date().toISOString(),
          customerName: String((src as any)?.customerName || ''),
          customerDoc: (src as any)?.customerDoc ?? null,
          customerId: Number.isFinite(clientId) && clientId > 0 ? clientId : undefined,
          paymentTerms: (src as any)?.paymentTerms ?? '',
          deliveryDate: (src as any)?.deliveryDate ? new Date((src as any).deliveryDate).toISOString().slice(0, 10) : '',
          orderTypeId: Number.isFinite(srcOrderTypeId) && srcOrderTypeId > 0 ? Math.trunc(srcOrderTypeId) : null,
          triangularCustomerName: (src as any)?.triangularCustomerName ?? '',
          triangularCustomerDoc: (src as any)?.triangularCustomerDoc ?? '',
          items: copiedItems,
          subtotal: 0,
          discountTotal: 0,
          total: 0
        });
        if (Number.isFinite(clientId) && clientId > 0) {
          loadLinkedOrderTypesForClient(clientId);
          loadPaymentTermsForClient(clientId);
        } else {
          setLinkedOrderTypes([]);
          setPaymentTermsOptions([]);
        }
      } catch (e: any) {
        alert(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [copyFromParam, loadLinkedOrderTypesForClient, loadPaymentTermsForClient]);
  
  const [currentDate, setCurrentDate] = useState('');
  const [sessionEntity, setSessionEntity] = useState<{ id: number; name: string; cnpj: string } | null>(null);

  useEffect(() => {
    setCurrentDate(new Date().toLocaleDateString('pt-BR'));
    fetch('/api/session/entity')
      .then(r => r.json())
      .then(data => {
        if (data && data.entity) {
          setSessionEntity(data.entity);
        }
      })
      .catch(console.error);
  }, []);
  
  const [showFeaturesFor, setShowFeaturesFor] = useState<number | null>(null);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const headerCollapsedTouchedRef = useRef(false);

  // Item search
  const [addingItems, setAddingItems] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<InventoryItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [totalWithTax, setTotalWithTax] = useState(0);
  const searchTermRef = useRef('');
  useEffect(() => {
    searchTermRef.current = searchTerm;
  }, [searchTerm]);

  const searchClientItems = useCallback(async (term: string) => {
    if (!order.customerId) {
      // If no customer selected, do not search
      setSearchResults([]);
      return;
    }
    if (linkedOrderTypes.length > 0 && !order.orderTypeId) {
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('q', term);
      if (order.customerId) {
        params.set('clientId', String(order.customerId));
      }
      if (order.orderTypeId) {
        params.set('orderTypeId', String(order.orderTypeId));
      }
      
      const res = await fetch(`/api/items?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.slice(0, 20));
      }
    } catch (e) {
      console.error(e);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [linkedOrderTypes.length, order.customerId, order.orderTypeId]);

  useEffect(() => {
    if (!addingItems) return;
    searchClientItems(searchTermRef.current);
  }, [addingItems, order.customerId, order.orderTypeId, searchClientItems]);

  const addItemToOrder = async (invItem: InventoryItem) => {
    let histDiscountPct = 0;
    let histDiscountValue = 0;
    if (searchHistItemDiscount && order.customerId) {
      try {
        const res = await fetch(`/api/sales/orders/last-item-discount?clientId=${encodeURIComponent(String(order.customerId))}&inventoryItemId=${encodeURIComponent(String(invItem.id))}`, { cache: 'no-store' });
        if (res.ok) {
          const j = await res.json().catch(() => null as any);
          histDiscountPct = Number(j?.discountPct ?? 0) || 0;
          histDiscountValue = Number(j?.discountValue ?? 0) || 0;
        }
      } catch {}
    }
    const newItem: OrderItem = {
      id: -Date.now(), // Temp ID
      name: invItem.name,
      sku: invItem.sku,
      unit: invItem.unit,
      quantity: 1,
      unitPrice: Number(invItem.unitPrice ?? 0),
      discountPct: histDiscountPct,
      discountValue: histDiscountValue,
      inventoryItem: invItem,
      width: invItem.width,
      length: invItem.length,
      grammage: invItem.grammage
    };
    
    setOrder(prev => {
      const currentItems = prev.items || [];
      return {
        ...prev,
        items: [...currentItems, newItem]
      };
    });
    setAddingItems(false);
    setSearchTerm('');
  };

  const removeItem = (id: number) => {
    if (!confirm('Confirma excluir este item?')) return;
    setOrder(prev => ({
      ...prev,
      items: (prev.items || []).filter(it => it.id !== id)
    }));
  };

  const updateItem = (id: number, changes: Partial<OrderItem>) => {
    setOrder(prev => ({
      ...prev,
      items: (prev.items || []).map(it => 
        it.id === id ? { ...it, ...changes } : it
      )
    }));
  };

  const saveOrder = async () => {
    if (!order.customerName) {
      alert('Informe o nome do cliente');
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch('/api/sales/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: order.customerName,
          customerDoc: order.customerDoc,
          customerId: order.customerId,
          orderTypeId: order.orderTypeId,
          triangularCustomerName: order.triangularCustomerName,
          triangularCustomerDoc: order.triangularCustomerDoc,
          entityCnpj: sessionEntity?.cnpj,
          paymentTerms: isFreePaymentTermsOrderType ? '' : order.paymentTerms,

          deliveryDate: order.deliveryDate,
          notes: order.notes ?? null,
          items: order.items?.map(it => ({
            inventoryItemId: it.inventoryItem?.id,
            name: it.name,
            sku: it.sku,
            unit: it.unit,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            discountPct: it.discountPct,
            discountValue: it.discountValue,
            width: it.width,
            length: it.length,
            grammage: it.grammage,
            diameter: it.diameter,
            tube: it.tube,
            clientOrderNumber: it.clientOrderNumber,
            clientOrderItemNumber: it.clientOrderItemNumber,
            itemDeliveryDate: it.itemDeliveryDate,
            internalResin: it.internalResin,
            externalResin: it.externalResin,
            creases: it.creases
          }))
        })
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Falha ao salvar pedido');
      }
      
      const saved = await res.json();
      router.push(`/sales/orders/${saved.id}`);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fmtCurrency = (n: number | undefined) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtInt = (n: number | undefined) => Math.round(n ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });

  const handleSimulateTaxes = async () => {
    const items = order.items || [];
    if (items.length === 0) {
      alert('Adicione pelo menos um item para simular impostos.');
      return;
    }
    
    if (items.some(it => it.quantity <= 0)) {
      alert('Todos os itens devem ter quantidade maior que zero.');
      return;
    }

    setSimulating(true);
    try {
      const res = await fetch('/api/sales/orders/simulate-tax', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Falha na simulação');
      }
      
      const data = await res.json();
      if (data && data.vltotcomimp !== undefined) {
        setTotalWithTax(Number(data.vltotcomimp));
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSimulating(false);
    }
  };

  const handleMirrorPdf = async () => {
    if (!order.customerName) {
      alert('Informe o nome do cliente');
      return;
    }
    const items = order.items || [];
    if (items.length === 0) {
      alert('Adicione pelo menos um item para gerar o PDF.');
      return;
    }
    setGeneratingPdf(true);
    try {
      const blobToBase64 = async (blob: Blob): Promise<string> => {
        const ab = await blob.arrayBuffer();
        const bytes = new Uint8Array(ab);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
      };

      const loadSvgAsPngBase64 = async (src: string, targetWidth: number): Promise<{ mime: string; base64: string } | null> => {
        try {
          const svgText = await fetch(src, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : ''));
          if (!svgText) return null;
          const blob = new Blob([svgText], { type: 'image/svg+xml' });
          const url = URL.createObjectURL(blob);
          try {
            const img = await new Promise<HTMLImageElement>((resolve, reject) => {
              const el = new Image();
              el.onload = () => resolve(el);
              el.onerror = () => reject(new Error('Falha ao carregar SVG'));
              el.src = url;
            });
            const w = img.naturalWidth || img.width || 1;
            const h = img.naturalHeight || img.height || 1;
            const cw = Math.max(1, Math.round(targetWidth));
            const ch = Math.max(1, Math.round((targetWidth * h) / w));
            const canvas = document.createElement('canvas');
            canvas.width = cw;
            canvas.height = ch;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;
            ctx.clearRect(0, 0, cw, ch);
            ctx.drawImage(img, 0, 0, cw, ch);
            const png = await new Promise<Blob>((resolve, reject) => {
              canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar PNG'))), 'image/png');
            });
            const base64 = await blobToBase64(png);
            return { mime: 'image/png', base64 };
          } finally {
            URL.revokeObjectURL(url);
          }
        } catch {
          return null;
        }
      };

      const loadThumbAsJpegBase64 = async (sku: string, size: number): Promise<{ sku: string; mime: string; base64: string } | null> => {
        const s = String(sku || '').trim();
        if (!s) return null;
        try {
          const res = await fetch(`/api/items/sku/${encodeURIComponent(s)}/thumbnail`, { cache: 'no-store' });
          if (!res.ok) return null;
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          try {
            const img = await new Promise<HTMLImageElement>((resolve, reject) => {
              const el = new Image();
              el.onload = () => resolve(el);
              el.onerror = () => reject(new Error('Falha ao carregar imagem'));
              el.src = url;
            });
            const w = img.naturalWidth || img.width || 1;
            const h = img.naturalHeight || img.height || 1;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;
            const scale = Math.min(size / w, size / h);
            const dw = Math.max(1, Math.round(w * scale));
            const dh = Math.max(1, Math.round(h * scale));
            const dx = Math.round((size - dw) / 2);
            const dy = Math.round((size - dh) / 2);
            ctx.clearRect(0, 0, size, size);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, size, size);
            ctx.drawImage(img, dx, dy, dw, dh);
            const out = await new Promise<Blob>((resolve, reject) => {
              canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar JPEG'))), 'image/jpeg', 0.85);
            });
            const base64 = await blobToBase64(out);
            return { sku: s, mime: 'image/jpeg', base64 };
          } finally {
            URL.revokeObjectURL(url);
          }
        } catch {
          return null;
        }
      };

      const logo = await loadSvgAsPngBase64('/icons/logo-prolinepet.svg', 520);
      const skuList = Array.from(
        new Set(
          items
            .map((it) => String((it.sku ?? it.inventoryItem?.sku) || '').trim())
            .filter(Boolean)
        )
      );
      const thumbs = (await Promise.all(skuList.map((sku) => loadThumbAsJpegBase64(sku, 96)))).filter(Boolean);

      const payload = {
        id: order.id ?? null,
        code: order.code ?? null,
        orderDate: order.orderDate ?? new Date().toISOString(),
        customerName: order.customerName || '',
        customerDoc: order.customerDoc ?? null,
        triangularCustomerName: order.triangularCustomerName ?? null,
        triangularCustomerDoc: order.triangularCustomerDoc ?? null,
        orderTypeId: order.orderTypeId ?? null,
        paymentTerms: order.paymentTerms ?? null,
        deliveryDate: order.deliveryDate ?? null,
        notes: order.notes ?? null,
        entity: sessionEntity ? { name: sessionEntity.name, cnpj: sessionEntity.cnpj } : null,
        logo,
        thumbs,
        items: items.map((it) => ({
          sku: it.sku ?? it.inventoryItem?.sku ?? null,
          name: it.name || '',
          unit: it.unit ?? null,
          quantity: Number(it.quantity || 0),
          unitPrice: Number(it.unitPrice || 0),
          discountPct: Number(it.discountPct || 0),
          priceTable: it.inventoryItem?.priceTable
            ? { nrtabpre: it.inventoryItem.priceTable.nrtabpre, descricao: it.inventoryItem.priceTable.descricao }
            : null,
        })),
      };

      const res = await fetch('/api/sales/orders/mirror-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || 'Falha ao gerar PDF');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank', 'noopener,noreferrer');
      if (!win) {
        const a = document.createElement('a');
        a.href = url;
        a.download = 'espelho-pedido.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      alert(e?.message || String(e));
    } finally {
      setGeneratingPdf(false);
    }
  };

  const computeWeightKg = (it: OrderItem): number => {
    const unitWeight = Number((it as any)?.inventoryItem?.unitWeightKg ?? 0);
    const qty = it.quantity ?? 0;
    if (Number.isFinite(unitWeight) && unitWeight > 0 && Number.isFinite(qty) && qty > 0) {
      return unitWeight * qty;
    }
    const hasDims = supportsSheetDims(it);
    if (hasDims) {
      const w = it.width ?? 0;
      const l = it.length ?? 0;
      const g = it.grammage ?? 0;
      const q = it.quantity ?? 0;
      if (w > 0 && l > 0 && g > 0 && q > 0) {
        const areaM2 = (l / 1000) * (w / 1000);
        const weightKg = (areaM2 * g * q) / 1000;
        return weightKg;
      }
    }
    return 0;
  };

  const familyPriceBy = (it: OrderItem): 'UNIT' | 'WEIGHT' => {
    const pb = String(it.inventoryItem?.commercialFamily?.priceBy || '').trim().toUpperCase();
    return pb === 'WEIGHT' || pb === 'PESO' ? 'WEIGHT' : 'UNIT';
  };

  const lineBase = (it: OrderItem): number => {
    const qty = it.quantity ?? 0;
    const price = it.unitPrice ?? 0;
    if (familyPriceBy(it) === 'WEIGHT') return computeWeightKg(it) * price;
    return qty * price;
  };

  const lineDiscount = (it: OrderItem): number => {
    const base = lineBase(it);
    const pct = Number(it.discountPct ?? 0);
    const dv = Number(it.discountValue ?? 0);
    const unitFactor = familyPriceBy(it) === 'WEIGHT' ? computeWeightKg(it) : (it.quantity ?? 0);
    const valueDisc = unitFactor * dv;
    const pctDisc = base * (pct / 100);
    return valueDisc + pctDisc;
  };

  const globalItems = order.items || [];
  const globalSubtotal = globalItems.reduce((s, it) => {
    return s + lineBase(it);
  }, 0);

  const globalDiscount = globalItems.reduce((s, it) => {
    return s + lineDiscount(it);
  }, 0);

  const globalTotalNoTax = globalSubtotal - globalDiscount;
  const globalWeight = globalItems.reduce((s, it) => s + Math.round(computeWeightKg(it)), 0);

  const groups = useMemo(() => {
    const out = new Map<string, OrderItem[]>();
    for (const it of (order.items || [])) {
      const key = familyName(it);
      const arr = out.get(key) || [];
      arr.push(it);
      out.set(key, arr);
    }
    return Array.from(out.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [order.items]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Novo Pedido</h1>
          <span className={`text-xs px-2 py-1 rounded ${statusChipStyle()}`}>
            {statusLabelPt()}
          </span>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-2 border rounded" title="Voltar" aria-label="Voltar" onClick={() => router.back()}>
            <span className="inline-flex items-center gap-2">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2Z"/></svg>
              Voltar
            </span>
          </button>
        </div>
      </div>

      {loading && <div className="text-sm text-gray-600">Processando...</div>}
      
      <div className="space-y-3">
        {/* Header */}
        <div className="border rounded bg-white p-2 text-sm relative">
          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
            <div className="order-1 sm:order-2 w-full sm:w-auto sm:ml-auto">
              <div className="flex flex-col items-stretch sm:items-end gap-2">
                <div className="flex sm:justify-end">
                  <button 
                    className="flex items-center gap-1 px-3 py-1 text-sm bg-white border border-gray-300 rounded shadow-sm text-gray-700 opacity-50 cursor-not-allowed" 
                    title="Simulação de impostos" 
                    onClick={handleSimulateTaxes}
                    disabled
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    {simulating ? 'Simulando...' : 'Simular Impostos'}
                  </button>
                </div>

                <div className="flex items-center gap-2 sm:justify-end">
                  <button
                    className={`${ICON_BTN} ${generatingPdf ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title="Espelho do pedido (PDF)"
                    aria-label="Espelho do pedido (PDF)"
                    disabled={generatingPdf}
                    style={{ opacity: generatingPdf ? 0.5 : 1, pointerEvents: generatingPdf ? 'none' : 'auto' }}
                    onClick={handleMirrorPdf}
                  >
                    {generatingPdf ? (
                      <svg className="animate-spin h-4 w-4 text-gray-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <path d="M14 2v6h6"></path>
                        <path d="M16 13H8"></path>
                        <path d="M16 17H8"></path>
                        <path d="M10 9H8"></path>
                      </svg>
                    )}
                  </button>
                  <button className={`${ICON_BTN} opacity-50 cursor-not-allowed`} title="Enviar para ERP (Desabilitado)" disabled>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                  </button>
                  <button className={`${ICON_BTN} opacity-50 cursor-not-allowed`} title="Excluir (Desabilitado)" disabled>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                  </button>
                  <button className={`${ICON_BTN} text-green-600 border-green-200 bg-green-50 hover:bg-green-100`} title="Salvar Pedido" onClick={saveOrder}>
                     <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17Z"/></svg>
                  </button>
                </div>

                <div className="flex sm:justify-end">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 px-3 py-2 border rounded bg-white hover:bg-gray-50 text-gray-700 text-sm"
                    onClick={() => {
                      setNotesDraft(String(order.notes || '').slice(0, 255));
                      setNotesOpen(true);
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                      <path d="M7 8h10" />
                      <path d="M7 12h7" />
                    </svg>
                    Observação do Pedido
                  </button>
                </div>
              </div>
            </div>

            <div className="order-2 sm:order-1 grid grid-cols-1 md:grid-cols-12 gap-3 flex-1">
              <div className="md:col-span-12 flex flex-wrap items-center gap-8">
                <div>
                  <span className="text-gray-600">Número</span>
                  <div className="font-mono mt-1 text-gray-400">(Automático)</div>
                </div>
                <div>
                  <span className="text-gray-600">Data</span>
                  <div className="mt-1">{currentDate}</div>
                </div>
              </div>

              <div className="md:col-span-6">
                <AsyncSelect
                  label="Cliente"
                  value={order.customerName || ''}
                  onChange={(val) => setOrder(prev => ({ ...prev, customerName: val }))}
                  onSelectObj={(c) => {
                    setOrder(prev => ({ ...prev, customerName: c.name, customerDoc: c.doc, customerId: c.id, orderTypeId: null, paymentTerms: '' }));
                    loadPaymentTermsForClient(Number(c.id));
                    loadLinkedOrderTypesForClient(Number(c.id));
                  }}
                  fetchUrl={(q) => `/api/base/clients?q=${q}`}
                  placeholder="Busque por nome ou documento"
                  getLabel={(c) => c.name}
                  renderOption={(c) => (
                    <div>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-gray-500">{c.doc}</div>
                    </div>
                  )}
                />
              </div>

              <div className="md:col-span-6">
                <span className="text-gray-600">Tipo de pedido</span>
                <select
                  className="mt-1 w-full px-2 py-1 border rounded"
                  value={order.orderTypeId != null ? String(order.orderTypeId) : ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    const next = v ? Number(v) : null;
                    (async () => {
                      const prev = lastOrderTypeIdRef.current;
                      const check = await ensureItemsCompatibilityForOrderType(next);
                      if (!check.ok) {
                        setOrder((p) => ({ ...p, orderTypeId: prev }));
                        return;
                      }
                      setOrder((p) => ({ ...p, orderTypeId: next, items: check.nextItems ?? p.items }));
                    })();
                  }}
                  disabled={!order.customerId || linkedOrderTypesLoading || linkedOrderTypes.length === 0}
                >
                  <option value="">
                    {!order.customerId
                      ? 'Selecione um cliente'
                      : linkedOrderTypesLoading
                      ? 'Carregando...'
                      : linkedOrderTypes.length === 0
                      ? 'Nenhum tipo vinculado'
                      : 'Selecione...'}
                  </option>
                  {linkedOrderTypes
                    .slice()
                    .sort((a, b) => String(a.descricao || '').localeCompare(String(b.descricao || ''), 'pt-BR'))
                    .map((ot) => (
                      <option key={ot.id} value={String(ot.id)}>
                        {ot.codtipoped} - {ot.descricao}
                      </option>
                    ))}
                </select>
              </div>

              {!headerCollapsed && (
              <>
              <div className="md:col-span-6">
                <span className="text-gray-600">Condição de pagamento</span>
                <select
                  className="mt-1 w-full px-2 py-1 border rounded"
                  value={order.paymentTerms ?? ''}
                  onChange={(e) => setOrder((prev) => ({ ...prev, paymentTerms: e.target.value }))}
                  disabled={isFreePaymentTermsOrderType || !order.customerId || paymentTermsLoading || paymentTermsOptions.length === 0}
                >
                  <option value="">
                    {isFreePaymentTermsOrderType
                      ? 'Não se aplica'
                      : !order.customerId
                      ? 'Selecione um cliente'
                      : paymentTermsLoading
                      ? 'Carregando...'
                      : paymentTermsOptions.length === 0
                      ? 'Nenhuma condição vinculada'
                      : 'Selecione...'}
                  </option>
                  {paymentTermsOptions.map((pt) => {
                    const label = paymentTermLabel(pt);
                    if (!label) return null;
                    return (
                      <option key={String(pt?.code ?? label)} value={label}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="md:col-span-6">
                <span className="text-gray-600">Entrega</span>
                <input 
                  type="date" 
                  className="mt-1 w-full px-2 py-1 border rounded" 
                  value={order.deliveryDate ?? ''} 
                  onChange={(e) => setOrder(prev => ({ ...prev, deliveryDate: e.target.value }))} 
                />
              </div>

              <div className="md:col-span-12 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <span className="text-gray-600">Total Sem Imp R$</span>
                  <div className="mt-1 w-full px-2 py-1 border rounded bg-gray-50 text-gray-800">{fmtCurrency(globalTotalNoTax)}</div>
                </div>
                <div>
                  <span className="text-gray-600">Total Com Imp R$</span>
                  <div className="mt-1 w-full px-2 py-1 border rounded bg-gray-50 text-gray-800">{fmtCurrency(totalWithTax)}</div>
                </div>
                <div>
                  <span className="text-gray-600">Total Peso (KG)</span>
                  <div className="mt-1 w-full px-2 py-1 border rounded bg-gray-50 text-gray-800">{fmtInt(globalWeight)}</div>
                </div>
              </div>
              </>
              )}
            </div>
          </div>
          <button
            type="button"
            className="absolute bottom-2 right-2 inline-flex items-center justify-center w-8 h-8 border rounded bg-white hover:bg-gray-50 text-gray-700"
            title={headerCollapsed ? 'Exibir campos' : 'Ocultar campos'}
            aria-label={headerCollapsed ? 'Exibir campos' : 'Ocultar campos'}
            onClick={() => {
              headerCollapsedTouchedRef.current = true;
              setHeaderCollapsed((v) => !v);
            }}
          >
            {headerCollapsed ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41Z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6 1.41 1.41Z" />
              </svg>
            )}
          </button>
        </div>

        {/* Itens */}
        <div className="border rounded bg-white">
          <div className="px-3 py-2 border-b flex items-center gap-2">
            <span className="text-sm text-gray-700">Itens</span>
            <div className="ml-auto flex items-center gap-3">
              <label className={`text-xs flex items-center gap-1 select-none ${isCpfCustomer ? 'opacity-50' : ''}`}>
                <input
                  type="checkbox"
                  checked={searchHistItemDiscount}
                  disabled={isCpfCustomer}
                  onChange={(e) => setSearchHistItemDiscount(e.target.checked)}
                />
                Busca Hist Desconto Item
              </label>
              <button 
                className={`px-2 py-1 text-xs border rounded bg-white hover:bg-gray-100 ${(!order.customerId || (linkedOrderTypes.length > 0 && !order.orderTypeId)) ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={!order.customerId || (linkedOrderTypes.length > 0 && !order.orderTypeId)}
                title={
                  !order.customerId
                    ? "Selecione um cliente primeiro"
                    : linkedOrderTypes.length > 0 && !order.orderTypeId
                    ? "Selecione o tipo de pedido primeiro"
                    : ""
                }
                onClick={() => {
                  if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 767px)').matches) {
                    setHeaderCollapsed(true);
                  }
                  setAddingItems(true);
                  setSearchTerm('');
                  searchClientItems('');
                }}
              >
                Adicionar itens
              </button>
            </div>
          </div>
          {addingItems && (
            <div className="p-3 border-b">
              <div className="flex items-center gap-2">
                <input 
                  className="flex-1 px-2 py-1 border rounded" 
                  placeholder="Pesquisar itens (digite para buscar)" 
                  value={searchTerm} 
                  onChange={(e) => { 
                    const v = e.target.value; 
                    setSearchTerm(v); 
                    searchClientItems(v); 
                  }} 
                  autoFocus
                />
                <button className="px-2 py-1 text-xs border rounded" onClick={() => setAddingItems(false)}>Fechar</button>
              </div>
              <div className="mt-2">
                {searchLoading && <div className="text-xs text-gray-500">Buscando...</div>}
                {searchResults.length === 0 && searchTerm && <div className="text-xs text-gray-500">Nenhum item encontrado.</div>}
                <ul className="divide-y max-h-60 overflow-auto">
                  {searchResults.map((it) => (
                    <li key={it.id} className="py-2 flex items-center gap-3 cursor-pointer hover:bg-gray-50 px-2 rounded" onClick={() => { void addItemToOrder(it); }}>
                      <div className="w-10 h-10 border rounded bg-white overflow-hidden flex items-center justify-center shrink-0">
                        {it.sku ? (
                          <img
                            src={`/api/items/sku/${encodeURIComponent(String(it.sku))}/thumbnail`}
                            alt=""
                            className="w-10 h-10 object-contain"
                            loading="lazy"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : null}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">{it.name}</div>
                        <div className="text-xs text-gray-600">
                          {it.sku || '-'} • {it.unit || '-'} 
                          {it.unitPrice ? ` • ${it.unitPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Groups */}
        {groups.map(([fam, list]) => (
          <div key={fam} className="border rounded bg-white">
            <div className="sm:hidden divide-y">
              {list.map((it) => (
                <SalesOrderItemCard
                  key={it.id}
                  item={it}
                  isOrderEditable={true}
                  canDelete={true}
                  disableDiscountFields={isCpfCustomer}
                  onPreviewUpdate={(updated) => updateItem(it.id, updated)}
                  onDelete={() => removeItem(it.id)}
                  showFeatures={showFeaturesFor === it.id}
                  toggleFeatures={() => setShowFeaturesFor(showFeaturesFor === it.id ? null : it.id)}
                  computeWeightKg={computeWeightKg}
                  fmtInt={fmtInt}
                  hasCoreCol={list.some(supportsCoreDims)}
                />
              ))}
            </div>
            <div className="hidden sm:block overflow-x-auto">
              <table className="min-w-full text-sm table-fixed">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="p-2 text-left w-[420px]">Item</th>
                    <th className="p-2 text-left w-24">SKU</th>
                    <th className="p-2 text-left w-16">UM</th>
                    <th className="p-2 text-left w-28">Tab. Preço</th>
                    {(() => { const hasCore = list.some(supportsCoreDims); return hasCore ? (<><th className="p-2 text-left w-24">Diâmetro</th><th className="p-2 text-left w-24">Tubete</th></>) : null; })()}
                    <th className="p-2 text-left w-20">Qtd</th>
                    <th className="p-2 text-left w-24">Peso (KG)</th>
                    <th className="p-2 text-left w-24">Preço</th>
                    <th className="p-2 text-left w-20">Desc (%)</th>
                    <th className="p-2 text-left w-24">Desc (R$)</th>
                    <th className="p-2 text-left w-24">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((it) => (
                    <SalesOrderItemRow
                      key={it.id}
                      item={it}
                      isOrderEditable={true}
                      canDelete={true}
                      disableDiscountFields={isCpfCustomer}
                      onPreviewUpdate={(updated) => updateItem(it.id, updated)}
                      onDelete={() => removeItem(it.id)}
                      showFeatures={showFeaturesFor === it.id}
                      toggleFeatures={() => setShowFeaturesFor(showFeaturesFor === it.id ? null : it.id)}
                      computeWeightKg={computeWeightKg}
                      fmtInt={fmtInt}
                      hasCoreCol={list.some(supportsCoreDims)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {(() => {
              const subtotal = list.reduce((s, it) => {
                return s + lineBase(it);
              }, 0);
              
              const discountTotal = list.reduce((s, it) => {
                return s + lineDiscount(it);
              }, 0);
              
              const total = subtotal - discountTotal;
              const totalWeight = list.reduce((s, it) => s + Math.round(computeWeightKg(it)), 0);
              return (
                <div className="px-3 py-2 text-xs text-gray-700 flex flex-wrap gap-4 justify-end border-t">
                  <span>Subtotal: {fmtCurrency(subtotal)}</span>
                  <span>Descontos: {fmtCurrency(discountTotal)}</span>
                  <span>Total Sem Imp R$: {fmtCurrency(total)}</span>
                  <span>Total Peso (KG): {fmtInt(totalWeight)}</span>
                </div>
              );
            })()}
          </div>
        ))}
      </div>

      {notesOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg bg-white rounded border shadow-lg">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="font-medium">Observação do Pedido</div>
              <button
                type="button"
                className="px-2 py-1 rounded border hover:bg-gray-50"
                onClick={() => setNotesOpen(false)}
                aria-label="Fechar"
                title="Fechar"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.41 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29 10.59 10.59 16.89 4.29l1.41 1.42Z" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-2">
              <div className="text-xs text-gray-600">Até 255 caracteres</div>
              <textarea
                className="w-full border rounded px-3 py-2 whitespace-pre-wrap"
                value={notesDraft}
                maxLength={255}
                onChange={(e) => setNotesDraft(e.target.value.slice(0, 255))}
                placeholder="Digite a observação do pedido"
                rows={5}
                wrap="soft"
              />
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500">{notesDraft.length}/255</div>
                <div className="flex gap-2">
                  <button type="button" className="px-3 py-2 border rounded hover:bg-gray-50" onClick={() => setNotesOpen(false)}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
                    onClick={() => {
                      const next = String(notesDraft || '').trim().slice(0, 255);
                      setOrder((prev) => ({ ...prev, notes: next || null }));
                      setNotesOpen(false);
                    }}
                  >
                    Salvar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: any}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
          <h2 className="font-bold mb-2">Erro no componente:</h2>
          <pre className="text-xs overflow-auto">{this.state.error?.toString()}</pre>
          <pre className="text-xs overflow-auto mt-2">{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function NewSalesOrderPage() {
  return (
    <Suspense fallback={<div>Carregando...</div>}>
      <ErrorBoundary>
        <NewSalesOrderContent />
      </ErrorBoundary>
    </Suspense>
  );
}
