"use client";
import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type PriceTableItemRow = {
  inventoryItemId: number;
  sku: string | null;
  name: string | null;
  unit: string | null;
  unitPrice: number;
};

type PriceTableDetails = {
  id: number;
  nrtabpre: string;
  descricao: string;
  situacao: number;
  items: PriceTableItemRow[];
};

type InventoryItemSug = {
  id: number;
  sku?: string | null;
  name?: string | null;
  unit?: string | null;
};

function situacaoLabel(v: number) {
  return v === 1 ? "Ativo" : v === 2 ? "Inativo" : String(v);
}

function Tabs({ active }: { active: "list" | "maint" }) {
  return (
    <div className="flex items-center gap-2 border-b">
      <Link
        href="/base/price-tables"
        className={`px-3 py-2 text-sm ${active === "list" ? "border-b-2 border-blue-600 font-medium" : "text-gray-600"}`}
      >
        Listagem
      </Link>
      <Link
        href="/base/price-tables/maintenance"
        className={`px-3 py-2 text-sm ${active === "maint" ? "border-b-2 border-blue-600 font-medium" : "text-gray-600"}`}
      >
        Manutenção
      </Link>
    </div>
  );
}

export default function PriceTableMaintenancePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idParam = searchParams.get("id");
  const id = idParam ? Number(idParam) : null;

  const [mode, setMode] = useState<"new" | "view" | "edit">("new");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<{ nrtabpre: string; descricao: string; situacao: number }>({
    nrtabpre: "",
    descricao: "",
    situacao: 1,
  });
  const originalRef = useRef<{ nrtabpre: string; descricao: string; situacao: number } | null>(null);
  const [items, setItems] = useState<PriceTableItemRow[]>([]);

  const [itemQuery, setItemQuery] = useState("");
  const [itemSug, setItemSug] = useState<InventoryItemSug[]>([]);
  const [showItemSug, setShowItemSug] = useState(false);

  const [linkForm, setLinkForm] = useState<{ inventoryItemId: number | null; sku: string; name: string; unit: string; unitPrice: string }>({
    inventoryItemId: null,
    sku: "",
    name: "",
    unit: "",
    unitPrice: "",
  });

  const canEditHeader = mode === "new" || mode === "edit";
  const priceTableId = useMemo(() => (id && Number.isFinite(id) && id > 0 ? Math.trunc(id) : null), [id]);

  const load = useCallback(async (pid: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/base/price-tables/${pid}`);
      const data = (await res.json()) as PriceTableDetails;
      if (!res.ok) throw new Error((data as any)?.error || `Erro ${res.status}`);
      setForm({ nrtabpre: String(data.nrtabpre || ""), descricao: String(data.descricao || ""), situacao: Number(data.situacao || 1) });
      originalRef.current = { nrtabpre: String(data.nrtabpre || ""), descricao: String(data.descricao || ""), situacao: Number(data.situacao || 1) };
      setItems(Array.isArray(data.items) ? data.items : []);
      setMode("view");
    } catch (e: any) {
      setError(e?.message || String(e));
      setItems([]);
      setMode("new");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (priceTableId) {
      void load(priceTableId);
      return;
    }
    setMode("new");
    originalRef.current = null;
    setForm({ nrtabpre: "", descricao: "", situacao: 1 });
    setItems([]);
    setLinkForm({ inventoryItemId: null, sku: "", name: "", unit: "", unitPrice: "" });
  }, [priceTableId, load]);

  useEffect(() => {
    const q = itemQuery.trim();
    if (!q) {
      setItemSug([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/items?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((data) => {
          const list = Array.isArray(data) ? data : [];
          setItemSug(
            list
              .slice(0, 10)
              .map((it: any) => ({ id: Number(it.id), sku: it.sku ?? null, name: it.name ?? null, unit: it.unit ?? null }))
              .filter((it: any) => Number.isFinite(it.id) && it.id > 0)
          );
        })
        .catch(() => setItemSug([]));
    }, 250);
    return () => clearTimeout(t);
  }, [itemQuery]);

  const clearLinkForm = () => {
    setItemQuery("");
    setItemSug([]);
    setShowItemSug(false);
    setLinkForm({ inventoryItemId: null, sku: "", name: "", unit: "", unitPrice: "" });
  };

  const saveHeader = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const payload = {
        nrtabpre: form.nrtabpre.trim(),
        descricao: form.descricao.trim(),
        situacao: Number(form.situacao),
      };

      if (mode === "new") {
        const res = await fetch("/api/base/price-tables", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
        router.replace(`/base/price-tables/maintenance?id=${data.id}`);
      } else if (mode === "edit" && priceTableId) {
        const res = await fetch(`/api/base/price-tables/${priceTableId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
        await load(priceTableId);
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
    setForm({ nrtabpre: "", descricao: "", situacao: 1 });
    setMode("new");
    clearLinkForm();
  };

  const deleteHeader = async () => {
    if (!priceTableId) return;
    if (!confirm("Excluir esta tabela de preço?")) return;
    try {
      const res = await fetch(`/api/base/price-tables/${priceTableId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      router.push("/base/price-tables");
    } catch (e: any) {
      alert(e?.message || String(e));
    }
  };

  const onPickItem = (it: InventoryItemSug) => {
    const linked = items.find((x) => x.inventoryItemId === it.id) || null;
    setLinkForm({
      inventoryItemId: it.id,
      sku: String(it.sku ?? ""),
      name: String(it.name ?? ""),
      unit: String(it.unit ?? ""),
      unitPrice: linked ? String(linked.unitPrice ?? 0) : "",
    });
    setItemQuery(`${it.sku ? `${it.sku} - ` : ""}${it.name || ""}`.trim());
    setShowItemSug(false);
  };

  const saveLink = async () => {
    if (!priceTableId) return;
    const inventoryItemId = linkForm.inventoryItemId;
    if (!inventoryItemId) return alert("Selecione um item");
    const unitPriceRaw = Number(String(linkForm.unitPrice || "").replace(",", "."));
    if (!Number.isFinite(unitPriceRaw) || unitPriceRaw < 0) return alert("Preço unitário inválido");
    try {
      const res = await fetch(`/api/base/price-tables/${priceTableId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventoryItemId, unitPrice: unitPriceRaw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      await load(priceTableId);
      clearLinkForm();
    } catch (e: any) {
      alert(e?.message || String(e));
    }
  };

  const deleteLink = async (inventoryItemId: number) => {
    if (!priceTableId) return;
    if (!confirm("Excluir vínculo do item?")) return;
    try {
      const res = await fetch(`/api/base/price-tables/${priceTableId}/items/${inventoryItemId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      await load(priceTableId);
      if (linkForm.inventoryItemId === inventoryItemId) clearLinkForm();
    } catch (e: any) {
      alert(e?.message || String(e));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Administração Tabela Preço</h1>
        <button onClick={() => router.push("/base/price-tables")} className="px-3 py-2 rounded border text-sm">
          Voltar
        </button>
      </div>

      <Tabs active="maint" />

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="border rounded p-3 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
          <div>
            <label className="text-xs text-gray-600">Cód Tab</label>
            <input
              value={form.nrtabpre}
              onChange={(e) => setForm((f) => ({ ...f, nrtabpre: e.target.value }))}
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
              <button onClick={() => router.push("/base/price-tables/maintenance")} className="px-3 py-2 rounded border text-sm">
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
              {mode === "view" && priceTableId && (
                <button onClick={() => setMode("edit")} className="px-3 py-2 rounded border text-sm">
                  Editar
                </button>
              )}
              {priceTableId && (
                <button onClick={() => void deleteHeader()} className="px-3 py-2 rounded border text-sm text-red-600">
                  Excluir
                </button>
              )}
            </div>
          </div>
        </div>

        {!priceTableId ? (
          <div className="text-sm text-gray-600">Salve a tabela de preço para vincular itens.</div>
        ) : (
          <div className="space-y-2">
            <div className="font-medium">Itens da Tabela</div>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
              <div className="md:col-span-3">
                <label className="text-xs text-gray-600">Pesquisar Item</label>
                <div className="relative">
                  <input
                    value={itemQuery}
                    onChange={(e) => {
                      setItemQuery(e.target.value);
                      setShowItemSug(true);
                      setLinkForm((f) => ({ ...f, inventoryItemId: null, sku: "", name: "", unit: "" }));
                    }}
                    onFocus={() => itemSug.length && setShowItemSug(true)}
                    onBlur={() => setTimeout(() => setShowItemSug(false), 150)}
                    className="w-full border rounded px-2 py-1 text-sm"
                    placeholder="Digite código ou descrição"
                  />
                  {showItemSug && itemSug.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full max-h-56 overflow-auto border rounded bg-white shadow">
                      {itemSug.map((it) => (
                        <button
                          key={it.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => onPickItem(it)}
                          className="w-full text-left px-3 py-2 hover:bg-gray-100"
                        >
                          <div className="text-sm">{it.name || "(sem descrição)"}</div>
                          <div className="text-xs text-gray-500">{it.sku ? `SKU: ${it.sku}` : `ID: ${it.id}`}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-600">Preço Unitário</label>
                <input
                  value={linkForm.unitPrice}
                  onChange={(e) => setLinkForm((f) => ({ ...f, unitPrice: e.target.value }))}
                  className="w-full border rounded px-2 py-1 text-sm"
                  placeholder="0,00"
                />
              </div>
              <div className="md:col-span-2 flex items-end justify-end gap-2">
                <button onClick={() => void saveLink()} className="px-3 py-2 rounded bg-blue-600 text-white text-sm">
                  Salvar
                </button>
                <button onClick={clearLinkForm} className="px-3 py-2 rounded border text-sm">
                  Cancelar
                </button>
                {linkForm.inventoryItemId && (
                  <button onClick={() => void deleteLink(linkForm.inventoryItemId!)} className="px-3 py-2 rounded border text-sm text-red-600">
                    Excluir
                  </button>
                )}
              </div>
            </div>

            <div className="border rounded overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2">SKU</th>
                    <th className="text-left px-3 py-2">Item</th>
                    <th className="text-left px-3 py-2">Un</th>
                    <th className="text-right px-3 py-2">Preço</th>
                    <th className="text-right px-3 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                        Carregando...
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                        Nenhum item vinculado
                      </td>
                    </tr>
                  ) : (
                    items.map((it) => (
                      <tr key={it.inventoryItemId} className="border-t">
                        <td className="px-3 py-2">{it.sku || it.inventoryItemId}</td>
                        <td className="px-3 py-2">{it.name}</td>
                        <td className="px-3 py-2">{it.unit}</td>
                        <td className="px-3 py-2 text-right">{Number(it.unitPrice || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              onClick={() => {
                                setLinkForm({
                                  inventoryItemId: it.inventoryItemId,
                                  sku: String(it.sku ?? ""),
                                  name: String(it.name ?? ""),
                                  unit: String(it.unit ?? ""),
                                  unitPrice: String(it.unitPrice ?? 0),
                                });
                                setItemQuery(`${it.sku ? `${it.sku} - ` : ""}${it.name || ""}`.trim());
                              }}
                              className="px-2 py-1 rounded border text-sm"
                            >
                              Editar
                            </button>
                            <button onClick={() => void deleteLink(it.inventoryItemId)} className="px-2 py-1 rounded border text-sm text-red-600">
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

            <div className="text-xs text-gray-500">
              Situação atual: {priceTableId ? `${situacaoLabel(form.situacao)}` : "-"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
