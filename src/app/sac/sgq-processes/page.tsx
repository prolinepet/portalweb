"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Process = { id: number; code: number; description: string; isActive: boolean };

export default function SacSgqProcessesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Process[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => String(r.code).includes(s) || String(r.description || "").toLowerCase().includes(s));
  }, [rows, q]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sac/sgq-processes", { cache: "no-store" });
      const data = await res.json().catch(() => null as any);
      if (!res.ok) throw new Error(data?.error || "Falha ao carregar processos");
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (id: number) => {
    if (!confirm("Confirma excluir este processo SAC/SGQ?")) return;
    try {
      const res = await fetch(`/api/sac/sgq-processes/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null as any);
      if (!res.ok) throw new Error(data?.error || "Falha ao excluir");
      setRows((prev) => prev.filter((p) => p.id !== id));
    } catch (e: any) {
      alert(String(e?.message || e));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">SAC/SGQ • Processos SAC/SGQ</h1>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/sac/sgq-processes/new")}
            className="px-3 py-1.5 text-xs border rounded bg-white hover:bg-gray-100"
          >
            Novo Processo SAC/SGQ
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="bg-white rounded border border-gray-200 p-3">
        <div className="flex items-center justify-between gap-3">
          <input
            className="w-full max-w-md px-3 py-2 border rounded"
            placeholder="Buscar por código ou descrição"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="button" onClick={load} className="px-3 py-2 text-sm border rounded bg-white hover:bg-gray-100">
            Atualizar
          </button>
        </div>
      </div>

      <div className="bg-white rounded border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="text-left px-3 py-2 w-28">Cód</th>
                <th className="text-left px-3 py-2">Descrição</th>
                <th className="text-left px-3 py-2 w-24">Ativo?</th>
                <th className="text-center px-3 py-2 w-40">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-gray-500">
                    Carregando...
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-gray-500">
                    Nenhum processo encontrado.
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((p) => (
                  <tr key={p.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">{p.code}</td>
                    <td className="px-3 py-2">{p.description}</td>
                    <td className="px-3 py-2">{p.isActive ? "Sim" : "Não"}</td>
                    <td className="px-3 py-2 text-center">
                      <div className="inline-flex">
                        <button
                          type="button"
                          onClick={() => router.push(`/sac/sgq-processes/${p.id}`)}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-gray-300 bg-white text-gray-700 shadow-sm hover:bg-gray-50 hover:text-gray-900"
                          title="Editar"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
                            <path d="M12 20h9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(p.id)}
                          className="ml-2 inline-flex items-center justify-center w-8 h-8 rounded-md border border-red-300 bg-white text-red-600 shadow-sm hover:bg-red-50"
                          title="Excluir"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
                            <path d="M3 6h18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M8 6V4h8v2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
