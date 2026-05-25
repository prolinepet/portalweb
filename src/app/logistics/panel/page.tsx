"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";

type PreCargaItem = {
  uf: string | null;
  cidade: string | null;
  dtEntrCli: string | null;
  cliente: string;
  estab: string | null;
  pedCli: string | null;
  aprovacao: string | null;
  seq: number | null;
  codItem: string | null;
  sdoPed: number;
  sdoEst: number;
  qtdProg: number;
  diverg: number;
  descricao: string;
  orderTypeKind: string | null;
};

type PreCarga = {
  id: number;
  dtPrevCarreg: string | null;
  cifFob: string | null;
  isFinalized: boolean;
};

type CheckRow = { key: string; label: string };

type TabKey = "processos" | "pre-carga" | "descarga" | "pre-devolucao";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function uniqSorted<T>(arr: T[], toKey: (v: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const v of arr) {
    const k = toKey(v);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

function addDays(ymd: string, deltaDays: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const d = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  d.setDate(d.getDate() + deltaDays);
  return toYmd(d);
}

export default function LogisticsPanelPage() {
  const [tab, setTab] = useState<TabKey>("pre-carga");
  const [dateStart, setDateStart] = useState<string>(() => addDays(toYmd(new Date()), -30));
  const [dateEnd, setDateEnd] = useState<string>(() => addDays(toYmd(new Date()), 10));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<PreCargaItem[]>([]);
  const [preCargas, setPreCargas] = useState<PreCarga[]>([]);
  const [selectedPreCargaId, setSelectedPreCargaId] = useState<number | null>(null);
  const [includeFinalized, setIncludeFinalized] = useState(false);
  const [preCargaMode, setPreCargaMode] = useState<"view" | "create" | "edit">("view");
  const [preCargaDtPrev, setPreCargaDtPrev] = useState<string>("");
  const [preCargaCifFob, setPreCargaCifFob] = useState<"CIF" | "FOB" | "">("");
  const [fEstabs, setFEstabs] = useState<Record<string, boolean>>({});
  const [fUfs, setFUfs] = useState<Record<string, boolean>>({});
  const [fCities, setFCities] = useState<Record<string, boolean>>({});
  const [showEstabModal, setShowEstabModal] = useState(false);
  const [showUfModal, setShowUfModal] = useState(false);
  const [showCityModal, setShowCityModal] = useState(false);
  const [filterNomeCliente, setFilterNomeCliente] = useState("");
  const [filterPedidoCliente, setFilterPedidoCliente] = useState("");
  const [filterItemDesc, setFilterItemDesc] = useState("");
  const [kVenda, setKVenda] = useState(true);
  const [kBon, setKBon] = useState(true);
  const [kAmostra, setKAmostra] = useState(true);
  const [apenasAprovados, setApenasAprovados] = useState(false);

  const loadPreCarga = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams();
      if (dateStart) qs.set("dateStart", dateStart);
      if (dateEnd) qs.set("dateEnd", dateEnd);
      const res = await fetch(`/api/logistics/panel/pre-carga/items?${qs.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      const normalized: PreCargaItem[] = (Array.isArray(data?.items) ? data.items : []).map((r: any) => ({
        uf: r?.uf == null ? null : String(r.uf),
        cidade: r?.cidade == null ? null : String(r.cidade),
        dtEntrCli: r?.dtEntrCli == null ? null : String(r.dtEntrCli),
        cliente: String(r?.cliente || ""),
        estab: r?.estab == null ? null : String(r.estab),
        pedCli: r?.pedCli == null ? null : String(r.pedCli),
        aprovacao: r?.aprovacao == null ? null : String(r.aprovacao),
        seq: r?.seq == null ? null : Number(r.seq),
        codItem: r?.codItem == null ? null : String(r.codItem),
        sdoPed: Number(r?.sdoPed || 0),
        sdoEst: Number(r?.sdoEst || 0),
        qtdProg: Number(r?.qtdProg || 0),
        diverg: Number(r?.diverg || 0),
        descricao: String(r?.descricao || ""),
        orderTypeKind: r?.orderTypeKind == null ? null : String(r.orderTypeKind),
      }));
      setItems(normalized);
    } catch (e: any) {
      setErr(e?.message || String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [dateStart, dateEnd]);

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
      const today = toYmd(new Date());
      setDateStart(addDays(today, -30));
      setDateEnd(addDays(today, 10));
    }
  }, [dateStart, dateEnd]);

  const totals = useMemo(() => {
    const countItems = items.length;
    const sumQtdProg = items.reduce((acc, it) => acc + (Number(it.qtdProg) || 0), 0);
    const sumSdoPed = items.reduce((acc, it) => acc + (Number(it.sdoPed) || 0), 0);
    return { countItems, sumQtdProg, sumSdoPed };
  }, [items]);

  const estabsAvailable = useMemo(() => {
    const rows: CheckRow[] = items
      .map((it) => String(it.estab || "").trim())
      .filter((s) => !!s)
      .map((s) => ({ key: s, label: s }));
    return uniqSorted(rows, (r) => r.key).sort((a, b) => a.label.localeCompare(b.label));
  }, [items]);

  const ufsAvailable = useMemo(() => {
    const rows: CheckRow[] = items
      .map((it) => String(it.uf || "").trim().toUpperCase())
      .filter((s) => !!s)
      .map((s) => ({ key: s, label: s }));
    return uniqSorted(rows, (r) => r.key).sort((a, b) => a.label.localeCompare(b.label));
  }, [items]);

  const citiesAvailable = useMemo(() => {
    const rows: CheckRow[] = items
      .map((it) => {
        const uf = String(it.uf || "").trim().toUpperCase();
        const city = String(it.cidade || "").trim();
        if (!uf || !city) return null;
        return { key: `${uf}|${city}`, label: `${uf}    ${city}` };
      })
      .filter(Boolean) as CheckRow[];
    return uniqSorted(rows, (r) => r.key).sort((a, b) => a.label.localeCompare(b.label));
  }, [items]);

  const kindAllowed = useCallback(
    (k: string | null) => {
      const kk = String(k || "").trim().toUpperCase();
      if (kk === "BONIFICACAO") return kBon;
      if (kk === "AMOSTRA") return kAmostra;
      return kVenda;
    },
    [kVenda, kBon, kAmostra]
  );

  const filteredItems = useMemo(() => {
    const nameQ = filterNomeCliente.trim().toLowerCase();
    const pedCliQ = filterPedidoCliente.trim().toLowerCase();
    const itemQ = filterItemDesc.trim().toLowerCase();

    const useEstab = Object.keys(fEstabs).length > 0;
    const useUf = Object.keys(fUfs).length > 0;
    const useCity = Object.keys(fCities).length > 0;

    return items.filter((it) => {
      if (!kindAllowed(it.orderTypeKind)) return false;

      if (useEstab) {
        const k = String(it.estab || "").trim();
        if (!fEstabs[k]) return false;
      }
      if (useUf) {
        const k = String(it.uf || "").trim().toUpperCase();
        if (!fUfs[k]) return false;
      }
      if (useCity) {
        const k = `${String(it.uf || "").trim().toUpperCase()}|${String(it.cidade || "").trim()}`;
        if (!fCities[k]) return false;
      }

      if (apenasAprovados) {
        const ap = String(it.aprovacao || "").trim().toUpperCase();
        if (ap !== "SIM") return false;
      }

      if (nameQ) {
        if (!String(it.cliente || "").toLowerCase().includes(nameQ)) return false;
      }
      if (pedCliQ) {
        if (!String(it.pedCli || "").toLowerCase().includes(pedCliQ)) return false;
      }
      if (itemQ) {
        const hay = `${it.codItem || ""} ${it.descricao || ""}`.toLowerCase();
        if (!hay.includes(itemQ)) return false;
      }

      return true;
    });
  }, [items, fEstabs, fUfs, fCities, filterNomeCliente, filterPedidoCliente, filterItemDesc, kindAllowed, apenasAprovados]);

  const FilterModal = ({
    title,
    rows,
    value,
    setValue,
    onClose,
    withSearch = false,
    showMarkButtons = false,
  }: {
    title: string;
    rows: CheckRow[];
    value: Record<string, boolean>;
    setValue: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    onClose: () => void;
    withSearch?: boolean;
    showMarkButtons?: boolean;
  }) => {
    const [search, setSearch] = useState("");
    const filtered = useMemo(() => {
      const s = search.trim().toLowerCase();
      if (!s) return rows;
      return rows.filter((r) => r.label.toLowerCase().includes(s));
    }, [rows, search]);

    const allChecked = Object.keys(value).length === 0;
    const isChecked = (k: string) => (allChecked ? true : Boolean(value[k]));

    const toggle = (k: string, checked: boolean) => {
      setValue((prev) => {
        const next = { ...prev };
        if (Object.keys(prev).length === 0) {
          for (const r of rows) next[r.key] = true;
        }
        next[k] = checked;
        const anyFalse = rows.some((r) => next[r.key] === false);
        const anyTrue = rows.some((r) => next[r.key] === true);
        if (!anyFalse && anyTrue) return {};
        return next;
      });
    };

    const markAll = () => setValue({});
    const unmarkAll = () =>
      setValue(() => {
        const next: Record<string, boolean> = {};
        for (const r of rows) next[r.key] = false;
        return next;
      });

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="bg-white rounded border w-full max-w-md shadow">
          <div className="p-3 border-b font-medium">{title}</div>
          <div className="p-3 space-y-2">
            {withSearch && (
              <div className="flex items-center gap-2">
                {showMarkButtons && (
                  <>
                    <button onClick={markAll} className="text-xs px-2 py-1 border rounded">
                      Marcar Todos
                    </button>
                    <button onClick={unmarkAll} className="text-xs px-2 py-1 border rounded">
                      Desmarcar Todos
                    </button>
                  </>
                )}
                <div className="flex items-center gap-1 ml-auto">
                  <div className="text-xs text-gray-600">Pesq.</div>
                  <input value={search} onChange={(e) => setSearch(e.target.value)} className="border rounded px-2 py-1 text-sm w-40" />
                </div>
              </div>
            )}

            <div className="border rounded max-h-64 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="p-2 w-10"></th>
                    <th className="p-2 text-left">{title.replace("Filtro Por ", "")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.key} className="border-b">
                      <td className="p-2">
                        <input type="checkbox" checked={isChecked(r.key)} onChange={(e) => toggle(r.key, e.target.checked)} />
                      </td>
                      <td className="p-2">{r.label}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={2} className="p-3 text-center text-gray-500">
                        Nenhum item.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="p-3 border-t flex justify-start">
            <button onClick={onClose} className="text-xs px-3 py-1.5 border rounded">
              Fechar
            </button>
          </div>
        </div>
      </div>
    );
  };

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
                Itens: {totals.countItems} • Qtd Prog: {totals.sumQtdProg} • Sdo Ped: {totals.sumSdoPed}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[140px_1fr_240px] gap-3">
              <div className="space-y-2">
                <button onClick={() => setShowEstabModal(true)} className="w-full text-xs px-2 py-1 border rounded bg-gray-50">Estabelecimento</button>
                <button onClick={() => setShowUfModal(true)} className="w-full text-xs px-2 py-1 border rounded bg-gray-50">Estado(UF)</button>
                <button onClick={() => setShowCityModal(true)} className="w-full text-xs px-2 py-1 border rounded bg-gray-50">Cidade</button>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-2 items-end">
                  <div>
                    <div className="text-xs text-gray-600 mb-1">Dt Entr Cli (de)</div>
                    <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} className="w-full border rounded px-2 py-1 text-xs h-8" />
                  </div>
                  <div className="flex items-center justify-center gap-1 pb-0.5">
                    <button
                      className="w-8 h-8 border rounded text-sm bg-gray-50 cursor-default"
                      title="Botão sem ação"
                      tabIndex={-1}
                      type="button"
                    >
                      {"<<"}
                    </button>
                    <button
                      className="w-8 h-8 border rounded text-sm bg-gray-50 cursor-default"
                      title="Botão sem ação"
                      tabIndex={-1}
                      type="button"
                    >
                      {">>"}
                    </button>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 mb-1">Dt Entr Cli (até)</div>
                    <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} className="w-full border rounded px-2 py-1 text-xs h-8" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <div className="text-xs text-gray-600 mb-1">Nome Cliente</div>
                    <input value={filterNomeCliente} onChange={(e) => setFilterNomeCliente(e.target.value)} className="w-full border rounded px-2 py-1 text-xs h-8" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 mb-1">Pedido Cliente</div>
                    <input value={filterPedidoCliente} onChange={(e) => setFilterPedidoCliente(e.target.value)} className="w-full border rounded px-2 py-1 text-xs h-8" />
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-600 mb-1">Item/Desc It</div>
                  <input value={filterItemDesc} onChange={(e) => setFilterItemDesc(e.target.value)} className="w-full border rounded px-2 py-1 text-xs h-8" />
                </div>
              </div>

              <div className="space-y-2">
                <div className="border rounded p-2">
                  <div className="text-xs text-gray-600 mb-2">Tipo Pedido</div>
                  <label className="text-xs flex items-center gap-2">
                    <input type="checkbox" checked={kVenda} onChange={(e) => setKVenda(e.target.checked)} /> Venda
                  </label>
                  <label className="text-xs flex items-center gap-2">
                    <input type="checkbox" checked={kBon} onChange={(e) => setKBon(e.target.checked)} /> Bonificação
                  </label>
                  <label className="text-xs flex items-center gap-2">
                    <input type="checkbox" checked={kAmostra} onChange={(e) => setKAmostra(e.target.checked)} /> Amostra
                  </label>
                  <label className="text-xs flex items-center gap-2 mt-2">
                    <input type="checkbox" checked={apenasAprovados} onChange={(e) => setApenasAprovados(e.target.checked)} /> Apenas Aprovados
                  </label>
                </div>

                <div className="border rounded p-2">
                  <div className="text-xs text-gray-600 mb-2">Agrupamento</div>
                  <label className="text-xs flex items-center gap-2">
                    <input type="checkbox" defaultChecked /> Estado(UF)
                  </label>
                  <label className="text-xs flex items-center gap-2">
                    <input type="checkbox" /> Cidade
                  </label>
                  <label className="text-xs flex items-center gap-2">
                    <input type="checkbox" /> Dt Entrega Cli
                  </label>
                  <label className="text-xs flex items-center gap-2">
                    <input type="checkbox" /> Cliente
                  </label>
                </div>

                <button onClick={loadPreCarga} className="text-xs px-3 py-2 bg-gray-200 rounded border disabled:opacity-50" disabled={loading}>
                  Aplica Filtro
                </button>
                {loading && <div className="text-xs text-gray-500">Carregando...</div>}
                {err && <div className="text-xs text-red-600">{err}</div>}
              </div>
            </div>

            <div className="border rounded overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left p-2 w-16">UF</th>
                    <th className="text-left p-2 w-48">Cidade</th>
                    <th className="text-left p-2 w-28">Dt Entr Cli</th>
                    <th className="text-left p-2 w-72">Cliente</th>
                    <th className="text-left p-2 w-20">Estab</th>
                    <th className="text-left p-2 w-28">Ped Cli</th>
                    <th className="text-left p-2 w-24">Aprovação</th>
                    <th className="text-right p-2 w-16">Seq</th>
                    <th className="text-left p-2 w-24">Cód Item</th>
                    <th className="text-right p-2 w-24">Sdo Ped</th>
                    <th className="text-right p-2 w-24">Sdo Est</th>
                    <th className="text-right p-2 w-24">Qtd Prog</th>
                    <th className="text-right p-2 w-20">Diverg</th>
                    <th className="text-left p-2 min-w-[360px]">Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length === 0 && (
                    <tr>
                      <td className="p-3 text-center text-gray-500" colSpan={14}>
                        Nenhum item encontrado.
                      </td>
                    </tr>
                  )}
                  {filteredItems.map((it, idx) => (
                    <tr key={`${idx}-${it.uf}-${it.cidade}-${it.estab}-${it.pedCli}-${it.codItem}-${it.sdoPed}`} className="border-b hover:bg-gray-50">
                      <td className="p-2">{it.uf || "-"}</td>
                      <td className="p-2">{it.cidade || "-"}</td>
                      <td className="p-2">{it.dtEntrCli ? it.dtEntrCli.slice(0, 10) : "-"}</td>
                      <td className="p-2">{it.cliente}</td>
                      <td className="p-2">{it.estab || "-"}</td>
                      <td className="p-2 font-mono text-xs">{it.pedCli || "-"}</td>
                      <td className="p-2">{it.aprovacao || "-"}</td>
                      <td className="p-2 text-right">{it.seq ?? "-"}</td>
                      <td className="p-2 font-mono text-xs">{it.codItem || "-"}</td>
                      <td className="p-2 text-right">{it.sdoPed}</td>
                      <td className="p-2 text-right">{it.sdoEst}</td>
                      <td className="p-2 text-right">{it.qtdProg}</td>
                      <td className="p-2 text-right">{it.diverg}</td>
                      <td className="p-2">{it.descricao}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showEstabModal && (
        <FilterModal title="Filtro Por Estabelecimento" rows={estabsAvailable} value={fEstabs} setValue={setFEstabs} onClose={() => setShowEstabModal(false)} />
      )}
      {showUfModal && (
        <FilterModal
          title="Filtro Por Estado(UF)"
          rows={ufsAvailable}
          value={fUfs}
          setValue={setFUfs}
          onClose={() => setShowUfModal(false)}
          withSearch
          showMarkButtons
        />
      )}
      {showCityModal && (
        <FilterModal
          title="Filtro Por Estado(UF) / Cidade"
          rows={citiesAvailable}
          value={fCities}
          setValue={setFCities}
          onClose={() => setShowCityModal(false)}
          withSearch
          showMarkButtons
        />
      )}
    </div>
  );
}
