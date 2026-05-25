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

type PreCarga = {
  id: number;
  dtPrevCarreg: string | null;
  cifFob: string | null;
  isFinalized: boolean;
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
  const [preCargas, setPreCargas] = useState<PreCarga[]>([]);
  const [selectedPreCargaId, setSelectedPreCargaId] = useState<number | null>(null);
  const [includeFinalized, setIncludeFinalized] = useState(false);
  const [preCargaMode, setPreCargaMode] = useState<"view" | "create" | "edit">("view");
  const [preCargaDtPrev, setPreCargaDtPrev] = useState<string>("");
  const [preCargaCifFob, setPreCargaCifFob] = useState<"CIF" | "FOB" | "">("");

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

  const loadPreCargas = useCallback(async () => {
    setErr(null);
    try {
      const qs = new URLSearchParams();
      if (includeFinalized) qs.set("includeFinalized", "1");
      const res = await fetch(`/api/logistics/panel/pre-carga?${qs.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      const normalized: PreCarga[] = (Array.isArray(data?.preCargas) ? data.preCargas : []).map((r: any) => ({
        id: Number(r?.id),
        dtPrevCarreg: r?.dtPrevCarreg == null ? null : String(r.dtPrevCarreg),
        cifFob: r?.cifFob == null ? null : String(r.cifFob),
        isFinalized: Boolean(r?.isFinalized),
      }));
      setPreCargas(normalized.filter((x) => Number.isFinite(x.id) && x.id > 0));
      setSelectedPreCargaId((prev) => {
        const still = prev != null && normalized.some((x) => x.id === prev);
        return still ? prev : normalized[0]?.id ?? null;
      });
    } catch (e: any) {
      setPreCargas([]);
      setSelectedPreCargaId(null);
      setErr(e?.message || String(e));
    }
  }, [includeFinalized]);

  useEffect(() => {
    if (tab !== "pre-carga") return;
    void loadPreCarga();
    void loadPreCargas();
  }, [tab, loadPreCarga, loadPreCargas]);

  const selectedPreCarga = useMemo(() => preCargas.find((p) => p.id === selectedPreCargaId) || null, [preCargas, selectedPreCargaId]);

  useEffect(() => {
    if (preCargaMode !== "view") return;
    if (!selectedPreCarga) {
      setPreCargaDtPrev("");
      setPreCargaCifFob("");
      return;
    }
    const dt = selectedPreCarga.dtPrevCarreg ? selectedPreCarga.dtPrevCarreg.slice(0, 10) : "";
    setPreCargaDtPrev(dt);
    const cf = String(selectedPreCarga.cifFob || "").toUpperCase();
    setPreCargaCifFob(cf === "CIF" || cf === "FOB" ? (cf as any) : "");
  }, [selectedPreCarga, preCargaMode]);

  const ensurePreCargaFields = (): string | null => {
    if (!preCargaDtPrev) return "Informe Dt Prev Carreg.";
    if (!preCargaCifFob) return "Informe CIF/FOB.";
    return null;
  };

  const startCreatePreCarga = () => {
    setPreCargaMode("create");
    setSelectedPreCargaId(null);
    setPreCargaDtPrev("");
    setPreCargaCifFob("");
  };

  const startEditPreCarga = () => {
    if (!selectedPreCarga) {
      alert("Selecione uma pré-carga.");
      return;
    }
    setPreCargaMode("edit");
  };

  const cancelPreCargaEdit = () => {
    setPreCargaMode("view");
  };

  const savePreCarga = async () => {
    const msg = ensurePreCargaFields();
    if (msg) {
      alert(msg);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      if (preCargaMode === "create") {
        const res = await fetch("/api/logistics/panel/pre-carga", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dtPrevCarreg: preCargaDtPrev, cifFob: preCargaCifFob }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
        const createdId = Number(data?.preCarga?.id);
        await loadPreCargas();
        setSelectedPreCargaId(Number.isFinite(createdId) && createdId > 0 ? createdId : null);
        setPreCargaMode("view");
        return;
      }
      if (preCargaMode === "edit") {
        if (!selectedPreCarga) {
          alert("Selecione uma pré-carga.");
          return;
        }
        const res = await fetch(`/api/logistics/panel/pre-carga/${selectedPreCarga.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dtPrevCarreg: preCargaDtPrev, cifFob: preCargaCifFob }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
        await loadPreCargas();
        setPreCargaMode("view");
      }
    } catch (e: any) {
      setErr(e?.message || String(e));
      alert(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const deletePreCarga = async () => {
    if (!selectedPreCarga) {
      alert("Selecione uma pré-carga.");
      return;
    }
    if (!confirm(`Confirma excluir a Pré-Carga ${selectedPreCarga.id}?`)) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/logistics/panel/pre-carga/${selectedPreCarga.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      setPreCargaMode("view");
      setSelectedPreCargaId(null);
      await loadPreCargas();
    } catch (e: any) {
      setErr(e?.message || String(e));
      alert(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

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
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
          <div className="bg-white rounded border p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium">Pré Cargas</div>
              <div className="flex items-center gap-1">
                <button
                  title={preCargaMode === "create" ? "Salvar inclusão" : "Incluir pré-carga"}
                  onClick={() => (preCargaMode === "create" ? void savePreCarga() : startCreatePreCarga())}
                  className="w-8 h-8 inline-flex items-center justify-center rounded border bg-gray-900 text-white disabled:opacity-50"
                  disabled={loading || preCargaMode === "edit"}
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M11 5h2v14h-2V5zm-6 6h14v2H5v-2z"/></svg>
                </button>
                <button
                  title={preCargaMode === "edit" ? "Salvar alteração" : "Editar pré-carga"}
                  onClick={() => (preCargaMode === "edit" ? void savePreCarga() : startEditPreCarga())}
                  className="w-8 h-8 inline-flex items-center justify-center rounded border text-blue-700 border-blue-300 hover:bg-blue-50 disabled:opacity-50"
                  disabled={loading || preCargaMode === "create"}
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M3 17.25V21h3.75L17.8 9.95l-3.75-3.75L3 17.25zm18-11.5a1 1 0 000-1.41l-1.59-1.59a1 1 0 00-1.41 0l-1.13 1.13 3.75 3.75L21 5.75z"/></svg>
                </button>
                <button
                  title="Cancelar inclusão/alteração"
                  onClick={cancelPreCargaEdit}
                  className="w-8 h-8 inline-flex items-center justify-center rounded border text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  disabled={loading || preCargaMode === "view"}
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M18.3 5.71L12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.3-6.3 1.41 1.42z"/></svg>
                </button>
                <button
                  title="Excluir pré-carga"
                  onClick={() => void deletePreCarga()}
                  className="w-8 h-8 inline-flex items-center justify-center rounded border text-red-700 border-red-300 hover:bg-red-50 disabled:opacity-50"
                  disabled={loading || preCargaMode !== "view" || !selectedPreCarga}
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M6 7h12v14H6V7zm3-4h6l1 1h4v2H4V4h4l1-1z"/></svg>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <div className="text-xs text-gray-600 mb-1">Nr. Pré-Carreg</div>
                <input
                  value={preCargaMode === "create" ? "" : selectedPreCarga ? String(selectedPreCarga.id) : ""}
                  placeholder={preCargaMode === "create" ? "(novo)" : ""}
                  className="w-full border rounded px-2 py-1 text-sm bg-gray-50"
                  disabled
                />
              </div>
              <div>
                <div className="text-xs text-gray-600 mb-1">Dt Prev Carreg</div>
                <input
                  type="date"
                  value={preCargaDtPrev}
                  onChange={(e) => setPreCargaDtPrev(e.target.value)}
                  className="w-full border rounded px-2 py-1 text-sm disabled:bg-gray-50"
                  disabled={preCargaMode === "view" || loading}
                />
              </div>
              <div>
                <div className="text-xs text-gray-600 mb-1">CIF/FOB</div>
                <select
                  value={preCargaCifFob}
                  onChange={(e) => setPreCargaCifFob((e.target.value || "") as any)}
                  className="w-full border rounded px-2 py-1 text-sm disabled:bg-gray-50"
                  disabled={preCargaMode === "view" || loading}
                >
                  <option value=""></option>
                  <option value="CIF">CIF</option>
                  <option value="FOB">FOB</option>
                </select>
              </div>

              <label className="text-xs flex items-center gap-2 mt-1">
                <input
                  type="checkbox"
                  checked={includeFinalized}
                  onChange={(e) => setIncludeFinalized(e.target.checked)}
                  disabled={loading || preCargaMode !== "view"}
                />
                Lista Finalizados
              </label>
            </div>

            <div className="mt-3 border rounded overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left p-2 w-16">Pré</th>
                    <th className="text-left p-2">Dt Prev</th>
                    <th className="text-left p-2 w-16">CIF</th>
                  </tr>
                </thead>
                <tbody>
                  {preCargas.length === 0 && (
                    <tr>
                      <td className="p-3 text-center text-gray-500" colSpan={3}>
                        Sem pré-cargas.
                      </td>
                    </tr>
                  )}
                  {preCargas.map((p) => {
                    const dt = p.dtPrevCarreg ? p.dtPrevCarreg.slice(0, 10) : "";
                    const active = selectedPreCargaId === p.id;
                    return (
                      <tr
                        key={p.id}
                        className={`border-b cursor-pointer ${active ? "bg-blue-50" : "hover:bg-gray-50"}`}
                        onClick={() => {
                          if (preCargaMode !== "view") return;
                          setSelectedPreCargaId(p.id);
                        }}
                      >
                        <td className="p-2 font-mono text-xs">{p.id}</td>
                        <td className="p-2">{dt}</td>
                        <td className="p-2">{(p.cifFob || "").toUpperCase()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
