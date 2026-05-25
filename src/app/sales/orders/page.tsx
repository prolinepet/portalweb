"use client";
import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";

type OrderItem = { id: number; name: string; quantity: number; unitPrice: number; discountPct: number };
type SalesOrder = {
  id: number;
  code: string;
  status: string;
  orderDate: string;
  customerName: string;
  clientId?: number | null;
  client?: { id: number; clientCode?: number | null; abbrevName?: string | null; name?: string | null } | null;
  orderType?: { codtipoped: number; descricao: string; kind?: 'VENDA' | 'BONIFICACAO' | 'AMOSTRA' | null } | null;
  createdBy?: { abbrevName?: string | null; name?: string | null } | null;
  subtotal: number;
  discountTotal: number;
  total: number;
  items?: OrderItem[];
};

type OrderTypeOption = { id: number; codtipoped: number; descricao: string; kind?: 'VENDA' | 'BONIFICACAO' | 'AMOSTRA' | null; situacao: number };

export default function SalesOrdersPage() {
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");
  const [dateStart, setDateStart] = useState<string>("");
  const [dateEnd, setDateEnd] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<SalesOrder | null>(null);
  const [integratingId, setIntegratingId] = useState<number | null>(null);
  const [erpModalOpen, setErpModalOpen] = useState(false);
  const [erpModalTitle, setErpModalTitle] = useState('');
  const [erpModalMessages, setErpModalMessages] = useState<string[]>([]);
  const [bonusBaseOrder, setBonusBaseOrder] = useState<SalesOrder | null>(null);
  const [bonusModalOpen, setBonusModalOpen] = useState(false);
  const [bonusOrderTypes, setBonusOrderTypes] = useState<OrderTypeOption[]>([]);
  const [bonusOrderTypesLoading, setBonusOrderTypesLoading] = useState(false);
  const [bonusOrderTypeId, setBonusOrderTypeId] = useState<number | null>(null);
  const [bonusPercent, setBonusPercent] = useState<string>('10');
  const [bonusCreating, setBonusCreating] = useState(false);

  const openErpModal = (title: string, messages: string[]) => {
    setErpModalTitle(String(title || 'Retorno ERP'));
    setErpModalMessages(Array.isArray(messages) ? messages.map((m) => String(m)).filter((m) => m.trim().length > 0) : []);
    setErpModalOpen(true);
  };

  const extractErpMessages = (data: any): string[] => {
    if (!data) return [];
    if (Array.isArray(data?.messages)) return data.messages.map((m: any) => String(m));
    const rows = Array.isArray(data?.RowErrors) ? data.RowErrors : [];
    const out: string[] = [];
    for (const it of rows) {
      const sub = String(it?.ErrorSubType || '').trim();
      const desc = String(it?.ErrorDescription || '').trim();
      if (sub || desc) out.push(`${sub || 'ERRO'}: ${desc || '-'}`);
    }
    return out;
  };

  const loadOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/sales/orders', { cache: 'no-store' });
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  const loadBonusOrderTypes = async (clientId: number) => {
    if (!Number.isFinite(clientId) || clientId <= 0) {
      setBonusOrderTypes([]);
      setBonusOrderTypeId(null);
      return;
    }
    setBonusOrderTypesLoading(true);
    try {
      const res = await fetch(`/api/base/clients/${encodeURIComponent(String(Math.trunc(clientId)))}/order-types`, { cache: 'no-store' });
      const data = await res.json().catch(() => []);
      const list = Array.isArray(data) ? (data as OrderTypeOption[]) : [];
      const onlyBonus = list.filter((ot) => ot && ot.situacao === 1 && String((ot as any)?.kind || '').toUpperCase() === 'BONIFICACAO');
      setBonusOrderTypes(onlyBonus);
      setBonusOrderTypeId((prev) => {
        const stillValid = prev != null && onlyBonus.some((ot) => Number(ot.id) === Number(prev));
        if (stillValid) return prev;
        if (onlyBonus.length === 1) return Number(onlyBonus[0].id);
        return null;
      });
    } catch {
      setBonusOrderTypes([]);
      setBonusOrderTypeId(null);
    } finally {
      setBonusOrderTypesLoading(false);
    }
  };

  const openBonusModal = async (order: SalesOrder) => {
    if (!order) return;
    setBonusBaseOrder(order);
    const clientId = Number((order as any)?.client?.id ?? (order as any)?.clientId);
    if (!Number.isFinite(clientId) || clientId <= 0) return alert('Pedido selecionado sem cliente vinculado.');
    setBonusPercent('10');
    await loadBonusOrderTypes(clientId);
    setBonusModalOpen(true);
  };

  const createBonusOrder = async () => {
    if (!bonusBaseOrder) return;
    const otId = Number(bonusOrderTypeId);
    if (!Number.isFinite(otId) || otId <= 0) return alert('Selecione o tipo de pedido (Bonificação).');
    const pct = Number(String(bonusPercent || '').trim().replace(',', '.'));
    if (!Number.isFinite(pct) || pct <= 0) return alert('Percentual inválido.');
    try {
      setBonusCreating(true);
      const res = await fetch('/api/sales/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bonusFromOrderId: bonusBaseOrder.id,
          bonusOrderTypeId: Math.trunc(otId),
          bonusPercent: pct,
        }),
      });
      const data = await res.json().catch(() => null as any);
      if (!res.ok) throw new Error(data?.error || 'Falha ao criar pedido de bonificação');
      const newId = Number(data?.id);
      if (Number.isFinite(newId) && newId > 0) {
        setBonusModalOpen(false);
        window.location.href = `/sales/orders/${newId}`;
        return;
      }
      const createdId = Number(data?.id ?? data?.order?.id ?? data?.result?.id);
      if (Number.isFinite(createdId) && createdId > 0) {
        setBonusModalOpen(false);
        window.location.href = `/sales/orders/${createdId}`;
        return;
      }
      throw new Error('Pedido criado, mas não foi possível obter o ID.');
    } catch (e: any) {
      alert(String(e?.message || e));
    } finally {
      setBonusCreating(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    const handleFocus = () => loadOrders();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadOrders();
    };
    const handlePageShow = () => loadOrders();

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

  const statusColor = (s: string) => {
    const v = (s || '').trim();
    switch (v) {
      case 'Orçamento': return 'bg-gray-100 text-gray-800';
      case 'Aguardando Integração': return 'bg-yellow-100 text-yellow-800';
      case 'Erro na integração': return 'bg-red-100 text-red-800';
      case 'Integrado': return 'bg-blue-100 text-blue-800';
      case 'Em fila produção': return 'bg-amber-100 text-amber-800';
      case 'Em produção': return 'bg-indigo-100 text-indigo-800';
      case 'Produzido/Estocado': return 'bg-cyan-100 text-cyan-800';
      case 'Faturado': return 'bg-green-100 text-green-800';
      case 'Cancelado': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const statusLabelPt = (s?: string) => {
    const v = (s || '').trim().toUpperCase();
    switch (v) {
      case 'OPEN': return 'Orçamento';
      case 'AGUARDANDO INTEGRAÇÃO':
      case 'AGUARDANDO INTEGRACAO':
      case 'AWAITING INTEGRATION': return 'Aguardando Integração';
      case 'INTEGRADO':
      case 'INTEGRATED': return 'Integrado';
      case 'ERRO NA INTEGRAÇÃO':
      case 'ERRO NA INTEGRACAO':
      case 'INTEGRATION ERROR': return 'Erro na integração';
      case 'EM FILA PRODUÇÃO':
      case 'EM FILA PRODUCAO': return 'Em fila produção';
      case 'EM PRODUÇÃO':
      case 'EM PRODUCAO': return 'Em produção';
      case 'PRODUZIDO/ESTOCADO': return 'Produzido/Estocado';
      case 'FATURADO': return 'Faturado';
      case 'CANCELADO': return 'Cancelado';
      default: return s || '-';
    }
  };

  const filtered = useMemo(() => {
    const qLower = q.trim().toLowerCase();
    const ds = dateStart ? new Date(dateStart) : null;
    const de = dateEnd ? new Date(dateEnd) : null;
    return (orders || [])
      .filter((o) => (status ? statusLabelPt(o.status) === status : true))
      .filter((o) => {
        if (!qLower) return true;
        return (
          (o.code || '').toLowerCase().includes(qLower) ||
          (o.customerName || '').toLowerCase().includes(qLower)
        );
      })
      .filter((o) => {
        const d = o.orderDate ? new Date(o.orderDate) : null;
        if (!d) return true;
        if (ds && d < ds) return false;
        if (de && d > de) return false;
        return true;
      });
  }, [orders, q, status, dateStart, dateEnd]);

  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page]);

  useEffect(() => {
    setPage(1);
  }, [q, status, dateStart, dateEnd]);

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), pageCount));
  }, [pageCount]);

  const calcTotal = (o: SalesOrder) => {
    return (o.items || []).reduce((acc, item) => {
      const total = item.quantity * item.unitPrice;
      const discount = total * (item.discountPct / 100);
      return acc + (total - discount);
    }, 0);
  };

  const canGenerateBonus = (o: SalesOrder) => {
    const kind = String(o?.orderType?.kind || '').trim().toUpperCase();
    return kind !== 'BONIFICACAO' && kind !== 'AMOSTRA';
  };

  const IconBtn = ({ title, onClick, children, disabled = false }: any) => (
    <button
      title={title}
      onClick={disabled ? undefined : onClick}
      className={`inline-flex items-center justify-center w-7 h-7 rounded border mr-1 ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100'}`}
      disabled={disabled}
    >
      {children}
    </button>
  );

  const EyeIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="3" strokeWidth="1.5" />
    </svg>
  );
  const FileIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" strokeWidth="1.5" />
      <path d="M14 2v6h6" strokeWidth="1.5" />
    </svg>
  );
  const SendIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
      <path d="M22 2 11 13" strokeWidth="1.5" />
      <path d="M22 2 15 22l-4-9-9-4Z" strokeWidth="1.5" />
    </svg>
  );
  const GiftIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
      <path d="M20 12v10H4V12" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 7h20v5H2z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 22V7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 7H7.5a2.5 2.5 0 1 1 0-5C10 2 12 7 12 7Z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 7h4.5a2.5 2.5 0 1 0 0-5C14 2 12 7 12 7Z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  const TrashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
      <path d="M3 6h18" strokeWidth="1.5" />
      <path d="M8 6V4h8v2" strokeWidth="1.5" />
      <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" strokeWidth="1.5" />
    </svg>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Venda • Consulta de Pedidos</h1>
        <div className="flex-1 flex items-center justify-center gap-2">
          <button
            type="button"
            className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-gray-300 bg-white text-gray-700 shadow-sm hover:bg-gray-50 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={loading || page <= 1}
            onClick={() => setPage(1)}
            title="Primeira página"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
              <path d="M11 19l-7-7 7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M20 19l-7-7 7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-gray-300 bg-white text-gray-700 shadow-sm hover:bg-gray-50 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={loading || page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            title="Página anterior"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
              <path d="M15 19l-7-7 7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className="text-xs text-gray-600 whitespace-nowrap">
            Página {page} de {pageCount}
          </span>
          <button
            type="button"
            className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-gray-300 bg-white text-gray-700 shadow-sm hover:bg-gray-50 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={loading || page >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            title="Próxima página"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
              <path d="M9 5l7 7-7 7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-gray-300 bg-white text-gray-700 shadow-sm hover:bg-gray-50 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={loading || page >= pageCount}
            onClick={() => setPage(pageCount)}
            title="Última página"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
              <path d="M4 19l7-7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M13 19l7-7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{filtered.length} registro(s)</span>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="px-3 py-1.5 text-xs border rounded bg-white hover:bg-gray-100"
          >
            Filtro
          </button>
          <Link href="/sales/orders/new" className="px-3 py-1.5 text-xs border rounded bg-white hover:bg-gray-100">Novo Pedido</Link>
        </div>
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}

      {/* Filtros */}
      {showFilters && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-gray-50 p-3 rounded border border-gray-200">
          <div>
            <label className="text-xs text-gray-600">Buscar (Número ou Cliente)</label>
            <input className="w-full mt-1 px-2 py-1.5 border rounded" placeholder="Ex: PED-0001 ou João" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-600">Situação</label>
            <select className="w-full mt-1 px-2 py-1.5 border rounded" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todas</option>
              <option value="Orçamento">Orçamento</option>
              <option value="Aguardando Integração">Aguardando Integração</option>
              <option value="Erro na integração">Erro na integração</option>
              <option value="Integrado">Integrado</option>
              <option value="Em fila produção">Em fila produção</option>
              <option value="Em produção">Em produção</option>
              <option value="Produzido/Estocado">Produzido/Estocado</option>
              <option value="Faturado">Faturado</option>
              <option value="Cancelado">Cancelado</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-600">Data inicial</label>
            <input type="date" className="w-full mt-1 px-2 py-1.5 border rounded" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-600">Data final</label>
            <input type="date" className="w-full mt-1 px-2 py-1.5 border rounded" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
          </div>
        </div>
      )}

      {/* Listagem */}
      <div className="bg-white rounded border border-gray-200 overflow-hidden">
        <div className="sm:hidden divide-y">
          {loading && (
            <div className="px-3 py-4 text-center text-gray-500 text-sm">Carregando...</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="px-3 py-4 text-center text-gray-500 text-sm">Nenhum pedido encontrado.</div>
          )}
          {!loading && paged.map((o) => (
            <div key={o.id} className="px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono text-xs text-gray-700">{o.code || o.id}</div>
                  <div className="text-sm font-medium text-gray-900 truncate">{o.client?.abbrevName || o.customerName || '-'}</div>
                  <div className="text-xs text-gray-600 truncate">Cód Cliente: {o.client?.clientCode ?? '-'}</div>
                  <div className="text-xs text-gray-600 truncate">{o.createdBy?.abbrevName || '-'}</div>
                  <div className="text-xs text-gray-600 truncate">{o.orderType ? `${o.orderType.codtipoped} - ${o.orderType.descricao}` : '-'}</div>
                </div>
                <span className={`shrink-0 px-2 py-0.5 rounded text-xs ${statusColor(statusLabelPt(o.status))}`}>{statusLabelPt(o.status)}</span>
              </div>

              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-gray-600">
                <div>{o.orderDate ? new Date(o.orderDate).toLocaleDateString('pt-BR') : '-'}</div>
                <div className="font-medium text-gray-900">{calcTotal(o).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
              </div>

              <div className="mt-2 flex items-center justify-end">
                <div className="inline-flex">
                  <IconBtn title="Visualizar" onClick={() => setSelected(o)}><EyeIcon /></IconBtn>
                  <IconBtn title="Detalhes" onClick={() => { window.location.href = `/sales/orders/${o.id}`; }}> <FileIcon /> </IconBtn>
                  <IconBtn title="Gerar Bonificação" disabled={!canGenerateBonus(o)} onClick={() => openBonusModal(o)}><GiftIcon /></IconBtn>
                  <IconBtn
                    title="Enviar para ERP"
                    disabled={integratingId === o.id || !['Orçamento', 'Erro na integração'].includes(statusLabelPt(o.status))}
                    onClick={async () => {
                      if (!confirm('Confirma enviar este pedido para o ERP?')) return;
                      setIntegratingId(o.id);
                      try {
                        const res = await fetch(`/api/sales/orders/${o.id}/integrate`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' }
                        });
                        if (!res.ok) {
                            const err = await res.json().catch(() => ({} as any));
                            const msgs = extractErpMessages(err);
                            openErpModal(err?.error ? `Erro ao enviar para ERP: ${String(err.error)}` : 'Erro ao enviar para ERP', msgs.length ? msgs : ['Verifique o histórico de situação.']);
                            return;
                        }
                        const data = await res.json();
                        
                        if (data.newStatus === 'Erro na integração') {
                            const msgs = extractErpMessages(data);
                            openErpModal('Erros na integração', msgs.length ? msgs : ['Verifique o histórico de situação.']);
                        } else if (data.newStatus === 'Integrado') {
                            const msgs = extractErpMessages(data);
                            openErpModal('Pedido integrado com sucesso', msgs.length ? msgs : ['Envio realizado com sucesso.']);
                        } else {
                            const msgs = extractErpMessages(data);
                            openErpModal('Envio realizado', msgs.length ? msgs : ['Envio realizado. Verifique o status atual.']);
                        }

                        await loadOrders();
                      } catch (e: any) { 
                          openErpModal('Erro ao enviar para ERP', [String(e?.message || e)]); 
                      } finally {
                          setIntegratingId(null);
                      }
                    }}
                  >
                    {integratingId === o.id ? (
                        <svg className="animate-spin h-3 w-3 text-gray-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    ) : <SendIcon />}
                  </IconBtn>
                  <IconBtn title="Excluir" disabled={!['Orçamento', 'Erro na integração'].includes(statusLabelPt(o.status))} onClick={async () => {
                    if (!confirm('Confirma excluir este pedido?')) return;
                    try {
                      const r = await fetch(`/api/sales/orders/${o.id}`, { method: 'DELETE' });
                      if (!r.ok) {
                        const body = await r.json().catch(() => null as any);
                        throw new Error(body?.error || 'Falha ao excluir pedido');
                      }
                      setOrders((prev) => prev.filter((so) => so.id !== o.id));
                    } catch (e: any) { alert(e?.message || String(e)); }
                  }}>
                    <TrashIcon />
                  </IconBtn>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden sm:block overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="text-left px-3 py-2">Número</th>
                <th className="text-left px-3 py-2">Representante</th>
                <th className="text-left px-3 py-2 w-24">Cód Cli.</th>
                <th className="text-left px-3 py-2 w-40">Nome Abrev</th>
                <th className="text-left px-3 py-2">Tipo Ped</th>
                <th className="text-left px-2 py-2 w-[70px]">Data</th>
                <th className="text-right px-3 py-2">Tot Ped R$</th>
                <th className="text-left px-3 py-2">Situação</th>
                <th className="text-center px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={9} className="px-3 py-4 text-center text-gray-500">Carregando...</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-4 text-center text-gray-500">Nenhum pedido encontrado.</td></tr>
              )}
              {!loading && paged.map((o) => (
                <tr
                  key={o.id}
                  className="border-t hover:bg-gray-50"
                >
                  <td className="px-3 py-2 font-mono text-xs">{o.code || o.id}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">{o.createdBy?.abbrevName || '-'}</td>
                  <td className="px-3 py-2 text-xs text-gray-600 w-24">{o.client?.clientCode ?? '-'}</td>
                  <td className="px-3 py-2 w-40 truncate">{o.client?.abbrevName || o.customerName || '-'}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">{o.orderType ? `${o.orderType.codtipoped} - ${o.orderType.descricao}` : '-'}</td>
                  <td className="px-2 py-2 whitespace-nowrap w-[70px]">{o.orderDate ? new Date(o.orderDate).toLocaleDateString('pt-BR') : '-'}</td>
                  <td className="px-3 py-2 text-right">
                    {calcTotal(o).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-xs ${statusColor(statusLabelPt(o.status))}`}>{statusLabelPt(o.status)}</span></td>
                  <td className="px-3 py-2 text-center">
                    <div className="inline-flex">
                      <IconBtn title="Visualizar" onClick={() => setSelected(o)}><EyeIcon /></IconBtn>
                      <IconBtn title="Detalhes" onClick={() => { window.location.href = `/sales/orders/${o.id}`; }}> <FileIcon /> </IconBtn>
                      <IconBtn title="Gerar Bonificação" disabled={!canGenerateBonus(o)} onClick={() => openBonusModal(o)}><GiftIcon /></IconBtn>
                      <IconBtn 
                        title="Enviar para ERP" 
                        disabled={integratingId === o.id || !['Orçamento', 'Erro na integração'].includes(statusLabelPt(o.status))}
                        onClick={async () => {
                          if (!confirm('Confirma enviar este pedido para o ERP?')) return;
                          setIntegratingId(o.id);
                          try {
                            const res = await fetch(`/api/sales/orders/${o.id}/integrate`, {
                                method: 'POST', headers: { 'Content-Type': 'application/json' }
                            });
                            if (!res.ok) {
                                const err = await res.json().catch(() => ({} as any));
                                const msgs = extractErpMessages(err);
                                openErpModal(err?.error ? `Erro ao enviar para ERP: ${String(err.error)}` : 'Erro ao enviar para ERP', msgs.length ? msgs : ['Verifique o histórico de situação.']);
                                return;
                            }
                            const data = await res.json();
                            
                            if (data.newStatus === 'Erro na integração') {
                                const msgs = extractErpMessages(data);
                                openErpModal('Erros na integração', msgs.length ? msgs : ['Verifique o histórico de situação.']);
                            } else if (data.newStatus === 'Integrado') {
                                const msgs = extractErpMessages(data);
                                openErpModal('Pedido integrado com sucesso', msgs.length ? msgs : ['Envio realizado com sucesso.']);
                            } else {
                                const msgs = extractErpMessages(data);
                                openErpModal('Envio realizado', msgs.length ? msgs : ['Envio realizado. Verifique o status atual.']);
                            }

                            await loadOrders();
                          } catch (e: any) { 
                              openErpModal('Erro ao enviar para ERP', [String(e?.message || e)]); 
                          } finally {
                              setIntegratingId(null);
                          }
                        }}
                      > 
                        {integratingId === o.id ? (
                            <svg className="animate-spin h-3 w-3 text-gray-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : <SendIcon />}
                      </IconBtn>
                      <IconBtn title="Excluir" disabled={!['Orçamento', 'Erro na integração'].includes(statusLabelPt(o.status))} onClick={async () => {
                        if (!confirm('Confirma excluir este pedido?')) return;
                        try {
                          const r = await fetch(`/api/sales/orders/${o.id}`, { method: 'DELETE' });
                          if (!r.ok) {
                            const body = await r.json().catch(() => null as any);
                            throw new Error(body?.error || 'Falha ao excluir pedido');
                          }
                          setOrders((prev) => prev.filter((so) => so.id !== o.id));
                        } catch (e: any) { alert(e?.message || String(e)); }
                      }}>
                        <TrashIcon />
                      </IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de itens */}
      {selected && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center" onClick={() => setSelected(null)}>
          <div className="bg-white w-full max-w-2xl rounded shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b flex items-center">
              <div className="font-semibold">Itens do pedido {selected.code || selected.id}</div>
              <button className="ml-auto text-gray-500 hover:text-black" onClick={() => setSelected(null)} aria-label="Fechar">×</button>
            </div>
            <div className="p-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-700">
                    <th className="text-left px-2 py-1">Item</th>
                    <th className="text-right px-2 py-1">Qtd</th>
                    <th className="text-right px-2 py-1">Preço</th>
                    <th className="text-right px-2 py-1">Desc (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {(selected.items || []).map((it) => (
                    <tr key={it.id} className="border-t">
                      <td className="px-2 py-1">{it.name}</td>
                      <td className="px-2 py-1 text-right">{it.quantity}</td>
                      <td className="px-2 py-1 text-right">{it.unitPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                      <td className="px-2 py-1 text-right">{it.discountPct}%</td>
                    </tr>
                  ))}
                  {(selected.items || []).length === 0 && (
                    <tr><td colSpan={4} className="px-2 py-2 text-center text-gray-500">Sem itens</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t text-right">
              <button className="px-3 py-1.5 border rounded hover:bg-gray-100" onClick={() => setSelected(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {bonusModalOpen && bonusBaseOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center" onClick={() => setBonusModalOpen(false)}>
          <div className="bg-white w-full max-w-xl rounded shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b flex items-center">
              <div className="font-semibold">Gerar Bonificação</div>
              <button className="ml-auto text-gray-500 hover:text-black" onClick={() => setBonusModalOpen(false)} aria-label="Fechar">×</button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <div className="text-xs text-gray-600">Pedido base</div>
                <div className="mt-1 font-mono text-xs text-gray-800">{bonusBaseOrder.code || bonusBaseOrder.id}</div>
                <div className="mt-1 text-sm text-gray-900">
                  {(bonusBaseOrder.client?.clientCode ?? '-') + ' - ' + (bonusBaseOrder.client?.abbrevName || bonusBaseOrder.customerName || '-')}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-600">Tipo de pedido (Bonificação)</label>
                <select
                  className="mt-1 w-full px-2 py-1.5 border rounded"
                  value={bonusOrderTypeId != null ? String(bonusOrderTypeId) : ''}
                  onChange={(e) => setBonusOrderTypeId(e.target.value ? Number(e.target.value) : null)}
                  disabled={bonusOrderTypesLoading || bonusOrderTypes.length === 0}
                >
                  <option value="">
                    {bonusOrderTypesLoading ? 'Carregando...' : bonusOrderTypes.length === 0 ? 'Nenhum tipo de bonificação disponível' : 'Selecione...'}
                  </option>
                  {bonusOrderTypes
                    .slice()
                    .sort((a, b) => String(a.descricao || '').localeCompare(String(b.descricao || ''), 'pt-BR'))
                    .map((ot) => (
                      <option key={ot.id} value={String(ot.id)}>
                        {ot.codtipoped} - {ot.descricao}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-600">Percentual (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  className="mt-1 w-full px-2 py-1.5 border rounded"
                  value={bonusPercent}
                  onChange={(e) => setBonusPercent(e.target.value)}
                />
              </div>
            </div>
            <div className="px-4 py-3 border-t text-right space-x-2">
              <button
                className="px-3 py-1.5 border rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={bonusCreating}
                onClick={createBonusOrder}
              >
                Criar pedido
              </button>
              <button className="px-3 py-1.5 border rounded hover:bg-gray-100" onClick={() => setBonusModalOpen(false)} disabled={bonusCreating}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {erpModalOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50"
          onClick={() => setErpModalOpen(false)}
        >
          <div className="bg-white w-full max-w-2xl rounded shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b flex items-center">
              <div className="font-semibold">{erpModalTitle || 'Retorno ERP'}</div>
              <button className="ml-auto text-gray-500 hover:text-black" onClick={() => setErpModalOpen(false)} aria-label="Fechar">
                ×
              </button>
            </div>
            <div className="p-4">
              {erpModalMessages.length > 0 ? (
                <ul className="list-disc pl-5 space-y-1 text-sm text-gray-800">
                  {erpModalMessages.map((m, idx) => (
                    <li key={idx}>{m}</li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-gray-700">Sem mensagens.</div>
              )}
            </div>
            <div className="px-4 py-3 border-t text-right">
              <button className="px-3 py-1.5 border rounded hover:bg-gray-100" onClick={() => setErpModalOpen(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
