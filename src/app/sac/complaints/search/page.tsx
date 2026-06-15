"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { safeParseJson } from "../../../../lib/safeJson";

type Complaint = {
  id: number;
  occurrenceDate?: string | null;
  counterpartyName?: string;
  sacSgqProcess?: { id: number; code: number; description: string } | null;
  sacSgqPhase?: { id: number; code: number; description: string } | null;
  phase?: string | null;
  responsibleUser?: { id: number; name: string; abbrevName?: string | null } | null;
};

export default function ComplaintSearchPage() {
  const router = useRouter();
  const [data, setData] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/sac/complaints", { cache: "no-store" });
        const json = await safeParseJson<any>(res, { complaints: [], error: undefined });
        if (!res.ok) {
          const msg = json?.error ? String(json.error) : `Falha ao carregar (HTTP ${res.status})`;
          throw new Error(msg);
        }
        const list: Complaint[] = Array.isArray(json) ? json : (json.complaints || []);
        if (mounted) setData(list);
      } catch (err: any) {
        setError(String(err?.message || err));
      } finally {
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Consulta Reclamação</h1>
        <button
          className="px-3 py-2 bg-blue-600 text-white rounded"
          onClick={() => router.push("/sac/complaints/new")}
        >Incluir Reclamação</button>
      </div>
      {loading && <div>Carregando...</div>}
      {error && <div className="text-red-600">{error}</div>}
      {!loading && !error && (
        <div className="overflow-x-auto">
          <table className="min-w-full border text-xs">
            <thead>
              <tr className="bg-gray-100">
                {["Nr Ocorr", "Data Ocorr", "Cliente", "Processo SAC/SGQ", "Fase Atual", "Responsável"].map((h) => (
                  <th key={h} className="border px-2 py-1 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((c)=> (
                <tr key={c.id}>
                  <td className="border px-2 py-1">{c.id}</td>
                  <td className="border px-2 py-1">
                    {(() => {
                      const d = c.occurrenceDate || null;
                      if (!d) return "";
                      const dt = new Date(d);
                      return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString();
                    })()}
                  </td>
                  <td className="border px-2 py-1">{c.counterpartyName || ""}</td>
                  <td className="border px-2 py-1">
                    {c.sacSgqProcess ? `${c.sacSgqProcess.code} - ${c.sacSgqProcess.description}` : ""}
                  </td>
                  <td className="border px-2 py-1">{c.sacSgqPhase?.description || c.phase || ""}</td>
                  <td className="border px-2 py-1">{c.responsibleUser?.abbrevName || c.responsibleUser?.name || ""}</td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-gray-500 py-3">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
