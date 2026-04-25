"use client";
import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type PriceTableLinkRow = {
  priceTableId: number;
  nrtabpre: string | null;
  descricao: string | null;
  situacao: number | null;
};

type OrderTypeDetails = {
  id: number;
  codtipoped: number;
  descricao: string;
  situacao: number;
  priceTables: PriceTableLinkRow[];
};

type PriceTableSug = {
  id: number;
  nrtabpre?: string | null;
  descricao?: string | null;
  situacao?: number | null;
};

function situacaoLabel(v: number) {
  return v === 1 ? "Ativo" : v === 2 ? "Inativo" : String(v);
}

function Tabs({ active }: { active: "list" | "maint" }) {
  return (
    <div className="flex items-center gap-2 border-b">
      <Link
        href="/base/order-types"
        className={`px-3 py-2 text-sm ${active === "list" ? "border-b-2 border-blue-600 font-medium" : "text-gray-600"}`}
      >
        Listagem
      </Link>
      <Link
        href="/base/order-types/maintenance"
        className={`px-3 py-2 text-sm ${active === "maint" ? "border-b-2 border-blue-600 font-medium" : "text-gray-600"}`}
      >
        Manutenção
      </Link>
    </div>
  );
}

export default function OrderTypeMaintenancePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idParam = searchParams?.get("id") ?? null;
  const id = idParam ? Number(idParam) : null;

  const [mode, setMode] = useState<"new" | "view" | "edit">("new");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<{ codtipoped: string; descricao: string; situacao: number }>({
    codtipoped: "",
    descricao: "",
    situacao: 1,
  });
  const originalRef = useRef<{ codtipoped: string; descricao: string; situacao: number } | null>(null);
  const [priceTables, setPriceTables] = useState<PriceTableLinkRow[]>([]);

  const [ptQuery, setPtQuery] = useState("");
  const [ptSug, setPtSug] = useState<PriceTableSug[]>([]);
  const [showPtSug, setShowPtSug] = useState(false);

  const [linkForm, setLinkForm] = useState<{ priceTableId: number | null; label: string }>({ priceTableId: null, label: "" });

  const canEditHeader = mode === "new" || mode === "edit";
  const orderTypeId = useMemo(() => (id && Number.isFinite(id) && id > 0 ? Math.trunc(id) : null), [id]);

  const load = useCallback(async (oid: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/base/order-types/${oid}`);
      const data = (await res.json()) as OrderTypeDetails;
      if (!res.ok) throw new Error((data as any)?.error || `Erro ${res.status}`);
      setForm({
        codtipoped: String(data.codtipoped ?? ""),
        descricao: String(data.descricao || ""),
        situacao: Number(data.situacao || 1),
      });
      originalRef.current = {
        codtipoped: String(data.codtipoped ?? ""),
        descricao: String(data.descricao || ""),
        situacao: Number(data.situacao || 1),
      };
      setPriceTables(Array.isArray(data.priceTables) ? data.priceTables : []);
      setMode("view");
    } catch (e: any) {
      setError(e?.message || String(e));
      setPriceTables([]);
      setMode("new");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (orderTypeId) {
      void load(orderTypeId);
      return;
    }
    setMode("new");
    originalRef.current = null;
    setForm({ codtipoped: "", descricao: "", situacao: 1 });
    setPriceTables([]);
    setPtQuery("");
    setPtSug([]);
    setShowPtSug(false);
    setLinkForm({ priceTableId: null, label: "" });
  }, [orderTypeId, load]);

  useEffect(() => {
    const q = ptQuery.trim();
    if (!q) {
      setPtSug([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/base/price-tables?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((data) => {
          const list = Array.isArray(data) ? data : [];
          setPtSug(
            list
              .slice(0, 10)
              .map((pt: any) => ({ id: Number(pt.id), nrtabpre: pt.nrtabpre ?? null, descricao: pt.descricao ?? null, situacao: pt.situacao ?? null }))
              .filter((pt: any) => Number.isFinite(pt.id) && pt.id > 0)
          );
        })
        .catch(() => setPtSug([]));
    }, 250);
    return () => clearTimeout(t);
  }, [ptQuery]);

  const clearLinkForm = () => {
    setPtQuery("");
    setPtSug([]);
    setShowPtSug(false);
    setLinkForm({ priceTableId: null, label: "" });
  };

  const saveHeader = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const codtipopedRaw = Number(form.codtipoped);
      const payload = {
        codtipoped: Number.isFinite(codtipopedRaw) ? Math.trunc(codtipopedRaw) : null,
        descricao: form.descricao.trim(),
        situacao: Number(form.situacao),
      };

      if (mode === "new") {
        const res = await fetch("/api/base/order-types", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
        router.replace(`/base/order-types/maintenance?id=${data.id}`);
      } else if (mode === "edit" && orderTypeId) {
        const res = await fetch(`/api/base/order-types/${orderTypeId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
        await load(orderTypeId);
      }
    } catch (e: any) {
      alert(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const cancelHeader = () => {
    if (mode === "edit" && originalRef.current) {
      setForm({ ...originalRef.current });
      setMode("view");
      return;
    }
    setForm({ codtipoped: "", descricao: "", situacao: 1 });
    setMode("new");
    clearLinkForm();
  };

  const deleteHeader = async () => {
    if (!orderTypeId) return;
    if (!confirm("Excluir este tipo de pedido?")) return;
    try {
      const res = await fetch(`/api/base/order-types/${orderTypeId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      router.push("/base/order-types");
    } catch (e: any) {
      alert(e?.message || String(e));
    }
  };

  const onPickPriceTable = (pt: PriceTableSug) => {
    setLinkForm({
      priceTableId: pt.id,
      label: `${pt.nrtabpre ? `${pt.nrtabpre} - ` : ""}${pt.descricao || ""}`.trim(),
    });
    setPtQuery(`${pt.nrtabpre ? `${pt.nrtabpre} - ` : ""}${pt.descricao || ""}`.trim());
    setShowPtSug(false);
  };

  const saveLink = async () => {
    if (!orderTypeId) return;
    const priceTableId = linkForm.priceTableId;
    if (!priceTableId) return alert("Selecione uma tabela de preço");
    try {
      const res = await fetch(`/api/base/order-types/${orderTypeId}/price-tables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceTableId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      await load(orderTypeId);
      clearLinkForm();
    } catch (e: any) {
      alert(e?.message || String(e));
    }
  };

  const deleteLink = async (priceTableId: number) => {
    if (!orderTypeId) return;
    if (!confirm("Excluir vínculo da tabela de preço?")) return;
    try {
      const res = await fetch(`/api/base/order-types/${orderTypeId}/price-tables/${priceTableId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      await load(orderTypeId);
      if (linkForm.priceTableId === priceTableId) clearLinkForm();
    } catch (e: any) {
      alert(e?.message || String(e));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Administração Tipo de Pedido</h1>
        <button onClick={() => router.push("/base/order-types")} className="px-3 py-2 rounded border text-sm">
          Voltar
        </button>
      </div>

      <Tabs active="maint" />

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="border rounded p-3 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
          <div>
            <label className="text-xs text-gray-600">Cód Tipo Ped</label>
            <input
              value={form.codtipoped}
              onChange={(e) => setForm((f) => ({ ...f, codtipoped: e.target.value }))}
              disabled={!canEditHeader}
              className={`w-full border rounded px-2 py-1 text-sm ${canEditHeader ? "" : "bg-gray-50"}`}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-gray-600">Descrição</label>
            <input
              value={form.descricao}
              onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
              disabled={!canEditHeader}
              className={`w-full border rounded px-2 py-1 text-sm ${canEditHeader ? "" : "bg-gray-50"}`}
            />
          </div>
          <div>
            <label className="text-xs text-gray-600">Situação</label>
            <select
              value={String(form.situacao)}
              onChange={(e) => setForm((f) => ({ ...f, situacao: Number(e.target.value) }))}
              disabled={!canEditHeader}
              className={`w-full border rounded px-2 py-1 text-sm ${canEditHeader ? "" : "bg-gray-50"}`}
            >
              <option value="1">1 - Ativo</option>
              <option value="2">2 - Inativo</option>
            </select>
          </div>
          <div className="md:col-span-2 flex items-end justify-end">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button onClick={() => router.push("/base/order-types/maintenance")} className="px-3 py-2 rounded border text-sm">
                Novo
              </button>
              <button
                onClick={() => void saveHeader()}
                disabled={saving || !canEditHeader}
                className={`px-3 py-2 rounded text-sm ${saving || !canEditHeader ? "bg-gray-200 text-gray-600" : "bg-blue-600 text-white"}`}
              >
                Salvar
              </button>
              <button onClick={cancelHeader} className="px-3 py-2 rounded border text-sm">
                Cancelar
              </button>
              {mode === "view" && orderTypeId && (
                <button onClick={() => setMode("edit")} className="px-3 py-2 rounded border text-sm">
                  Editar
                </button>
              )}
              {orderTypeId && (
                <button onClick={() => void deleteHeader()} className="px-3 py-2 rounded border text-sm text-red-600">
                  Excluir
                </button>
              )}
            </div>
          </div>
        </div>

        {!orderTypeId ? (
          <div className="text-sm text-gray-600">Salve o tipo de pedido para vincular tabelas de preço.</div>
        ) : (
          <div className="space-y-2">
            <div className="font-medium">Tabelas de Preço Vinculadas</div>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
              <div className="md:col-span-4">
                <label className="text-xs text-gray-600">Pesquisar Tabela de Preço</label>
                <div className="relative">
                  <input
                    value={ptQuery}
                    onChange={(e) => {
                      setPtQuery(e.target.value);
                      setShowPtSug(true);
                      setLinkForm({ priceTableId: null, label: "" });
                    }}
                    onFocus={() => ptSug.length && setShowPtSug(true)}
                    onBlur={() => setTimeout(() => setShowPtSug(false), 150)}
                    className="w-full border rounded px-2 py-1 text-sm"
                    placeholder="Digite Cód Tab ou Descrição"
                  />
                  {showPtSug && ptSug.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full max-h-56 overflow-auto border rounded bg-white shadow">
                      {ptSug.map((pt) => (
                        <button
                          key={pt.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => onPickPriceTable(pt)}
                          className="w-full text-left px-3 py-2 hover:bg-gray-100"
                        >
                          <div className="text-sm">{pt.descricao || "(sem descrição)"}</div>
                          <div className="text-xs text-gray-500">{pt.nrtabpre ? `Cód Tab: ${pt.nrtabpre}` : `ID: ${pt.id}`}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="md:col-span-2 flex items-end justify-end gap-2">
                <button onClick={() => void saveLink()} className="px-3 py-2 rounded bg-blue-600 text-white text-sm">
                  Salvar
                </button>
                <button onClick={clearLinkForm} className="px-3 py-2 rounded border text-sm">
                  Cancelar
                </button>
                {linkForm.priceTableId && (
                  <button onClick={() => void deleteLink(linkForm.priceTableId!)} className="px-3 py-2 rounded border text-sm text-red-600">
                    Excluir
                  </button>
                )}
              </div>
            </div>

            <div className="border rounded overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2">Cód Tab</th>
                    <th className="text-left px-3 py-2">Descrição</th>
                    <th className="text-left px-3 py-2">Situação</th>
                    <th className="text-right px-3 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-gray-500">
                        Carregando...
                      </td>
                    </tr>
                  ) : priceTables.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-gray-500">
                        Nenhuma tabela vinculada
                      </td>
                    </tr>
                  ) : (
                    priceTables.map((pt) => (
                      <tr key={pt.priceTableId} className="border-t">
                        <td className="px-3 py-2">{pt.nrtabpre || pt.priceTableId}</td>
                        <td className="px-3 py-2">{pt.descricao}</td>
                        <td className="px-3 py-2">{pt.situacao != null ? situacaoLabel(Number(pt.situacao)) : "-"}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              onClick={() => {
                                setLinkForm({
                                  priceTableId: pt.priceTableId,
                                  label: `${pt.nrtabpre ? `${pt.nrtabpre} - ` : ""}${pt.descricao || ""}`.trim(),
                                });
                                setPtQuery(`${pt.nrtabpre ? `${pt.nrtabpre} - ` : ""}${pt.descricao || ""}`.trim());
                              }}
                              className="px-2 py-1 rounded border text-sm"
                            >
                              Editar
                            </button>
                            <button onClick={() => void deleteLink(pt.priceTableId)} className="px-2 py-1 rounded border text-sm text-red-600">
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="text-xs text-gray-500">Situação atual: {orderTypeId ? situacaoLabel(form.situacao) : "-"}</div>
          </div>
        )}
      </div>
    </div>
  );
}
