"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";

type PreCargaItem = {
  orderId: number;
  orderCode: string | null;
  status: string | null;
  createdAt: string;
  estab: string | null;
  customerCode: number | null;
  customerName: string;
  customerCity: string | null;
  customerUf: string | null;
  sku: string | null;
  itemName: string;
  quantity: number;
  unit: string | null;
  sdoPed: number;
};

type TabKey = "processos" | "pre-carga" | "descarga" | "pre-devolucao";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export default function LogisticsPanelPage() {
  const [tab, setTab] = useState<TabKey>("pre-carga");
  const [dateStart, setDateStart] = useState<string>(() => "2023-01-01");
  const [dateEnd, setDateEnd] = useState<string>(() => "9999-12-31");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<PreCargaItem[]>([]);

  const loadPreCarga = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams();
      if (dateStart) qs.set("dateStart", dateStart);
      if (dateEnd) qs.set("dateEnd", dateEnd);
      if (q.trim()) qs.set("q", q.trim());
      const res = await fetch(`/api/logistics/panel/pre-carga/items?${qs.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      const normalized: PreCargaItem[] = (Array.isArray(data?.items) ? data.items : []).map((r: any) => ({
        orderId: Number(r?.orderId),
        orderCode: r?.orderCode == null ? null : String(r.orderCode),
        status: r?.status == null ? null : String(r.status),
        createdAt: String(r?.createdAt || ""),
        estab: r?.estab == null ? null : String(r.estab),
        customerCode: r?.customerCode == null ? null : Number(r.customerCode),
        customerName: String(r?.customerName || ""),
        customerCity: r?.customerCity == null ? null : String(r.customerCity),
        customerUf: r?.customerUf == null ? null : String(r.customerUf),
        sku: r?.sku == null ? null : String(r.sku),
        itemName: String(r?.itemName || ""),
        quantity: Number(r?.quantity || 0),
        unit: r?.unit == null ? null : String(r.unit),
        sdoPed: Number(r?.sdoPed || 0),
      }));
      setItems(normalized.filter((x) => Number.isFinite(x.orderId) && x.orderId > 0));
    } catch (e: any) {
      setErr(e?.message || String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [dateStart, dateEnd, q]);

  useEffect(() => {
    if (tab !== "pre-carga") return;
    void loadPreCarga();
  }, [tab, loadPreCarga]);

  useEffect(() => {
    if (!dateStart && !dateEnd) {
      const now = new Date();
      setDateStart(toYmd(new Date(now.getFullYear(), 0, 1)));
      setDateEnd("9999-12-31");
    }
  }, [dateStart, dateEnd]);

  const totals = useMemo(() => {
    const countOrders = new Set(items.map((i) => i.orderId)).size;
    const countItems = items.length;
    const sumQtd = items.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
    const sumSdo = items.reduce((acc, it) => acc + (Number(it.sdoPed) || 0), 0);
    return { countOrders, countItems, sumQtd, sumSdo };
  }, [items]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Painel Logístico</h1>

      <div className="flex items-center gap-2 border-b">
        <button onClick={() => setTab("processos")} className={`px-3 py-2 text-sm ${tab === "processos" ? "border-b-2 border-blue-600 font-medium" : "text-gray-600"}`}>Processos</button>
        <button onClick={() => setTab("pre-carga")} className={`px-3 py-2 text-sm ${tab === "pre-carga" ? "border-b-2 border-blue-600 font-medium" : "text-gray-600"}`}>Pré-Carga</button>
        <button onClick={() => setTab("descarga")} className={`px-3 py-2 text-sm ${tab === "descarga" ? "border-b-2 border-blue-600 font-medium" : "text-gray-600"}`}>Descarga</button>
        <button onClick={() => setTab("pre-devolucao")} className={`px-3 py-2 text-sm ${tab === "pre-devolucao" ? "border-b-2 border-blue-600 font-medium" : "text-gray-600"}`}>Pré-Devolução</button>
      </div>

      {tab !== "pre-carga" && (
        <div className="bg-white rounded border p-4 text-sm text-gray-600">Tela em construção.</div>
      )}

      {tab === "pre-carga" && (
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
          <div className="bg-white rounded border p-3">
            <div className="font-medium mb-2">Pré Cargas</div>
            <div className="text-sm text-gray-600">Não disponível nesta versão.</div>
          </div>

          <div className="bg-white rounded border p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium">Itens Pré-Carga</div>
              <div className="text-xs text-gray-600">
                Pedidos: {totals.countOrders} • Itens: {totals.countItems} • Qtd: {totals.sumQtd} • Sdo Ped: {totals.sumSdo}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <div>
                <div className="text-xs text-gray-600 mb-1">Dt Entr Cli (de)</div>
                <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
              </div>
              <div>
                <div className="text-xs text-gray-600 mb-1">Dt Entr Cli (até)</div>
                <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
              </div>
              <div className="md:col-span-2">
                <div className="text-xs text-gray-600 mb-1">Filtro</div>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pedido / Cliente / SKU / Item" className="w-full border rounded px-2 py-1 text-sm" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={loadPreCarga} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded disabled:opacity-50" disabled={loading}>Aplicar Filtro</button>
              {loading && <div className="text-xs text-gray-500">Carregando...</div>}
              {err && <div className="text-xs text-red-600">{err}</div>}
            </div>

            <div className="border rounded overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left p-2 w-24">Estab</th>
                    <th className="text-left p-2 w-28">Pedido</th>
                    <th className="text-left p-2 w-20">Cód Cli</th>
                    <th className="text-left p-2">Cliente</th>
                    <th className="text-left p-2 w-20">UF</th>
                    <th className="text-left p-2 w-28">SKU</th>
                    <th className="text-left p-2">Item</th>
                    <th className="text-right p-2 w-24">Qtd</th>
                    <th className="text-right p-2 w-24">Sdo Ped</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr>
                      <td className="p-3 text-center text-gray-500" colSpan={9}>
                        Nenhum item encontrado.
                      </td>
                    </tr>
                  )}
                  {items.map((it) => (
                    <tr key={`${it.orderId}-${it.sku || it.itemName}-${it.quantity}-${it.sdoPed}`} className="border-b hover:bg-gray-50">
                      <td className="p-2">{it.estab || "-"}</td>
                      <td className="p-2 font-mono text-xs">{it.orderCode || it.orderId}</td>
                      <td className="p-2">{it.customerCode ?? "-"}</td>
                      <td className="p-2">{it.customerName}</td>
                      <td className="p-2">{it.customerUf || "-"}</td>
                      <td className="p-2 font-mono text-xs">{it.sku || "-"}</td>
                      <td className="p-2">{it.itemName}</td>
                      <td className="p-2 text-right">{it.quantity}</td>
                      <td className="p-2 text-right">{it.sdoPed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

