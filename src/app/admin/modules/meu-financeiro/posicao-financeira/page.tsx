"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, Send, Trash2 } from "lucide-react";

type Status = "ABERTO" | "PAGO";
type Row = {
  id: number;
  kind: Kind;
  numero: string;
  dueDate: string | null;
  amount: number;
  status: Status;
  integrated: boolean;
  description: string | null;
};
type Kind = "RECEBER" | "PAGAR";

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function formatDateBR(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
}

export default function PosicaoFinanceiraPage() {
  const searchParams = useSearchParams();
  const [kind, setKind] = useState<Kind>("RECEBER");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [integratingId, setIntegratingId] = useState<number | null>(null);

  const extractErpMessages = (data: any): string[] => {
    if (!data) return [];
    if (Array.isArray(data?.messages)) return data.messages.map((message: any) => String(message));
    const rows = Array.isArray(data?.RowErrors) ? data.RowErrors : [];
    const out: string[] = [];
    for (const item of rows) {
      const subType = String(item?.ErrorSubType || "").trim();
      const description = String(item?.ErrorDescription || "").trim();
      if (subType || description) out.push(`${subType || "ERRO"}: ${description || "-"}`);
    }
    return out;
  };

  useEffect(() => {
    const nextKind = searchParams?.get("kind");
    if (nextKind === "RECEBER" || nextKind === "PAGAR") {
      setKind(nextKind);
    }
  }, [searchParams]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/meu-financeiro/financial-titles", { cache: "no-store" });
      const data = await res.json().catch(() => []);
      if (!res.ok) {
        setRows([]);
        setError(String(data?.error || "Não foi possível carregar os títulos."));
        return;
      }

      const nextRows: Row[] = Array.isArray(data)
        ? data.map((item) => ({
            id: Number(item.id),
            kind: item.kind === "PAGAR" ? ("PAGAR" as Kind) : ("RECEBER" as Kind),
            numero: String(item.numero || ""),
            dueDate: item.dueDate ? String(item.dueDate) : null,
            amount: Number(item.amount) || 0,
            status: item.status === "PAGO" ? ("PAGO" as Status) : ("ABERTO" as Status),
            integrated: Boolean(item.integrated),
            description: item.description ? String(item.description) : null,
          }))
        : [];

      setRows(nextRows);
    } catch {
      setRows([]);
      setError("Não foi possível carregar os títulos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const data = useMemo(() => {
    const totals = {
      RECEBER: rows.filter((r) => r.kind === "RECEBER").reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
      PAGAR: rows.filter((r) => r.kind === "PAGAR").reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
    };
    return {
      receber: rows.filter((r) => r.kind === "RECEBER"),
      pagar: rows.filter((r) => r.kind === "PAGAR"),
      totals,
    };
  }, [rows]);

  const visibleRows = kind === "RECEBER" ? data.receber : data.pagar;

  const handleSendToErp = async (id: number) => {
    if (!confirm("Confirma enviar este título para o ERP?")) return;

    setError(null);
    setSuccess(null);
    setIntegratingId(id);

    try {
      const res = await fetch(`/api/meu-financeiro/financial-titles/${id}/integrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const messages = extractErpMessages(data);
        setError(
          [String(data?.error || "Não foi possível integrar o título."), ...messages]
            .filter((message) => String(message || "").trim().length > 0)
            .join(" ")
        );
        return;
      }

      const messages = extractErpMessages(data);
      setRows((current) =>
        current.map((row) =>
          row.id === id
            ? {
                ...row,
                integrated: true,
                dueDate: data?.dueDate ? String(data.dueDate) : row.dueDate,
              }
            : row
        )
      );
      setSuccess(
        messages.length > 0 ? `Título integrado com sucesso. ${messages.join(" ")}` : "Título integrado com sucesso."
      );
    } catch (err: any) {
      setError(String(err?.message || "Não foi possível integrar o título."));
    } finally {
      setIntegratingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    setError(null);
    setSuccess(null);
    const res = await fetch(`/api/meu-financeiro/financial-titles/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(String(data?.error || "Não foi possível excluir o título."));
      return;
    }
    setRows((current) => current.filter((row) => row.id !== id));
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Meu Financeiro • Posição Financeira</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => setKind("RECEBER")}
          className={`text-left rounded border bg-white p-4 shadow-sm transition-colors ${
            kind === "RECEBER" ? "border-blue-500 ring-1 ring-blue-200" : "border-gray-200 hover:border-gray-300"
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm text-blue-600 font-medium">A Receber</div>
              <div className="text-2xl font-semibold text-blue-700 mt-1">{formatBRL(data.totals.RECEBER)}</div>
            </div>
            <div className="text-blue-600">
              <ArrowUpRight className="w-5 h-5" />
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setKind("PAGAR")}
          className={`text-left rounded border bg-white p-4 shadow-sm transition-colors ${
            kind === "PAGAR" ? "border-red-400 ring-1 ring-red-200" : "border-gray-200 hover:border-gray-300"
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm text-red-600 font-medium">A Pagar</div>
              <div className="text-2xl font-semibold text-red-700 mt-1">{formatBRL(data.totals.PAGAR)}</div>
            </div>
            <div className="text-red-600">
              <ArrowDownRight className="w-5 h-5" />
            </div>
          </div>
        </button>
      </div>

      <div className="bg-white rounded border p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="font-medium">Detalhamento: {kind === "RECEBER" ? "A Receber" : "A Pagar"}</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadRows()}
              className="px-3 py-2 rounded border text-sm hover:bg-gray-50"
            >
              Atualizar
            </button>
            <Link
              href="/admin/modules/meu-financeiro/novo-reembolso"
              className="px-3 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
            >
              Criar Reembolso
            </Link>
          </div>
        </div>

        {error && <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {success && <div className="mt-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{success}</div>}

        <div className="mt-3 overflow-x-auto border rounded">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="p-2">Número do Título</th>
                <th className="p-2">Data Vencimento</th>
                <th className="p-2">Valor R$</th>
                <th className="p-2">Situação</th>
                <th className="p-2">Integrado</th>
                <th className="p-2 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="p-3 text-gray-500">
                    Carregando títulos...
                  </td>
                </tr>
              )}
              {!loading &&
                visibleRows.map((r) => (
                <tr key={r.id} className="border-b last:border-b-0">
                  <td className="p-2">{r.numero}</td>
                  <td className="p-2">{formatDateBR(r.dueDate)}</td>
                  <td className="p-2">{formatBRL(r.amount)}</td>
                  <td className="p-2">
                    {r.status === "PAGO" ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 border border-green-200">
                        Pago
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-700 border border-red-200">
                        Aberto
                      </span>
                    )}
                  </td>
                  <td className="p-2">
                    {r.integrated ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 border border-blue-200">
                        Sim
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700 border border-gray-200">
                        Não
                      </span>
                    )}
                  </td>
                  <td className="p-2">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${
                          r.integrated || integratingId === r.id
                            ? "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
                            : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                        }`}
                        disabled={r.integrated || integratingId === r.id}
                        onClick={() => void handleSendToErp(r.id)}
                      >
                        {integratingId === r.id ? (
                          <>
                            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
                            </svg>
                            Enviando...
                          </>
                        ) : (
                          <>
                            <Send className="h-3.5 w-3.5" />
                            Enviar ao ERP
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${
                          r.integrated
                            ? "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
                            : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                        }`}
                        disabled={r.integrated}
                        onClick={() => void handleDelete(r.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && visibleRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-2 text-gray-500">
                    Nenhum título
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
