"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type ReimbursementTypeRow = {
  id: number;
  description: string;
};

function Tabs({ active }: { active: "list" | "maint" }) {
  return (
    <div className="flex items-center gap-2 border-b">
      <Link
        href="/base/reimbursement-types"
        className={`px-3 py-2 text-sm ${active === "list" ? "border-b-2 border-blue-600 font-medium" : "text-gray-600"}`}
      >
        Listagem
      </Link>
      <Link
        href="/base/reimbursement-types/maintenance"
        className={`px-3 py-2 text-sm ${active === "maint" ? "border-b-2 border-blue-600 font-medium" : "text-gray-600"}`}
      >
        Manutenção
      </Link>
    </div>
  );
}

export default function ReimbursementTypeListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ReimbursementTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = query.trim();
      const url = q ? `/api/base/reimbursement-types?q=${encodeURIComponent(q)}` : "/api/base/reimbursement-types";
      const res = await fetch(url, { cache: "no-store" });
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
    return rows.filter((r) => String(r.id).includes(q) || String(r.description || "").toLowerCase().includes(q));
  }, [rows, query]);

  const onDelete = async (id: number) => {
    if (!confirm("Excluir este tipo de reembolso?")) return;
    try {
      const res = await fetch(`/api/base/reimbursement-types/${id}`, { method: "DELETE" });
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
        <h1 className="text-xl font-semibold">Administração Tipo Reembolso</h1>
        <button onClick={() => router.push("/base/reimbursement-types/maintenance")} className="px-3 py-2 rounded bg-green-600 text-white text-sm">
          Novo
        </button>
      </div>

      <Tabs active="list" />

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por código ou descrição"
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
              <th className="text-left px-3 py-2">Código</th>
              <th className="text-left px-3 py-2">Descrição</th>
              <th className="text-right px-3 py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-gray-500">
                  Carregando...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-gray-500">
                  Nenhum tipo de reembolso encontrado
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">{r.id}</td>
                  <td className="px-3 py-2">{r.description}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button onClick={() => router.push(`/base/reimbursement-types/maintenance?id=${r.id}`)} className="px-2 py-1 rounded border text-sm">
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
