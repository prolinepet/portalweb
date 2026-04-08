"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type OrderTypeRow = {
  id: number;
  codtipoped: number;
  descricao: string;
  situacao: number;
};

function situacaoLabel(v: number) {
  return v === 1 ? "Ativo" : v === 2 ? "Inativo" : String(v);
}

function Tabs({ active }: { active: "list" | "maint" }) {
  return (
    <div className="flex items-center gap-2 border-b">
      <a
        href="/base/order-types"
        className={`px-3 py-2 text-sm ${active === "list" ? "border-b-2 border-blue-600 font-medium" : "text-gray-600"}`}
      >
        Listagem
      </a>
      <a
        href="/base/order-types/maintenance"
        className={`px-3 py-2 text-sm ${active === "maint" ? "border-b-2 border-blue-600 font-medium" : "text-gray-600"}`}
      >
        Manutenção
      </a>
    </div>
  );
}

export default function OrderTypeListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<OrderTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = query.trim();
      const url = q ? `/api/base/order-types?q=${encodeURIComponent(q)}` : "/api/base/order-types";
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => String(r.codtipoped).includes(q) || (r.descricao || "").toLowerCase().includes(q));
  }, [rows, query]);

  const onDelete = async (id: number) => {
    if (!confirm("Excluir este tipo de pedido?")) return;
    try {
      const res = await fetch(`/api/base/order-types/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      await load();
    } catch (e: any) {
      alert(e?.message || String(e));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Administração Tipo de Pedido</h1>
        <button onClick={() => router.push("/base/order-types/maintenance")} className="px-3 py-2 rounded bg-green-600 text-white text-sm">
          Novo
        </button>
      </div>

      <Tabs active="list" />

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por Cód Tipo Ped ou Descrição"
          className="flex-1 border rounded px-3 py-2 text-sm"
        />
        <button onClick={() => void load()} className="px-3 py-2 rounded bg-blue-600 text-white text-sm">
          Buscar
        </button>
      </div>

      <div className="border rounded overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2">Cód Tipo Ped</th>
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
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-gray-500">
                  Nenhum tipo de pedido encontrado
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">{r.codtipoped}</td>
                  <td className="px-3 py-2">{r.descricao}</td>
                  <td className="px-3 py-2">{situacaoLabel(r.situacao)}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button onClick={() => router.push(`/base/order-types/maintenance?id=${r.id}`)} className="px-2 py-1 rounded border text-sm">
                        Editar
                      </button>
                      <button onClick={() => void onDelete(r.id)} className="px-2 py-1 rounded border text-sm text-red-600">
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
    </div>
  );
}

