"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Check, Eye, RotateCcw, Send, Trash2, X } from "lucide-react";

type Status = "EM_DIGITACAO" | "EM_AVALIACAO" | "AGUARDANDO_INTEGRACAO" | "INTEGRADO";
type ApprovalStatus = "PENDENTE" | "APROVADO" | "REPROVADO";
type Row = {
  id: number;
  kind: Kind;
  numero: string;
  dueDate: string | null;
  amount: number;
  status: Status;
  approvalStatus: ApprovalStatus;
  integrated: boolean;
  description: string | null;
};
type Kind = "RECEBER" | "PAGAR";

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function formatDateBR(iso: string | null): string {
  if (!iso) return "-";
  const datePart = String(iso).split("T")[0];
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (match) {
    const [, year, month, day] = match;
    return `${day}/${month}/${year}`;
  }

  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(d);
}

function normalizeWorkflowStatus(value: unknown, integrated: boolean): Status {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "EM_AVALIACAO") return "EM_AVALIACAO";
  if (normalized === "AGUARDANDO_INTEGRACAO") return "AGUARDANDO_INTEGRACAO";
  if (normalized === "INTEGRADO") return "INTEGRADO";
  if (normalized === "EM_DIGITACAO") return "EM_DIGITACAO";
  return integrated ? "INTEGRADO" : "EM_DIGITACAO";
}

function normalizeApprovalStatus(value: unknown, integrated: boolean): ApprovalStatus {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "APROVADO") return "APROVADO";
  if (normalized === "REPROVADO") return "REPROVADO";
  if (normalized === "PENDENTE") return "PENDENTE";
  return integrated ? "APROVADO" : "PENDENTE";
}

function getStatusBadge(status: Status) {
  switch (status) {
    case "EM_DIGITACAO":
      return "inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700 border border-gray-200";
    case "EM_AVALIACAO":
      return "inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-200";
    case "AGUARDANDO_INTEGRACAO":
      return "inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200";
    case "INTEGRADO":
      return "inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 border border-green-200";
  }
}

function getStatusLabel(status: Status) {
  switch (status) {
    case "EM_DIGITACAO":
      return "Em digitação";
    case "EM_AVALIACAO":
      return "Em avaliação";
    case "AGUARDANDO_INTEGRACAO":
      return "Aguardando Integração";
    case "INTEGRADO":
      return "Integrado";
  }
}

function getApprovalBadge(status: ApprovalStatus) {
  switch (status) {
    case "PENDENTE":
      return "inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700 border border-gray-200";
    case "APROVADO":
      return "inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 border border-green-200";
    case "REPROVADO":
      return "inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-700 border border-red-200";
  }
}

function getApprovalLabel(status: ApprovalStatus) {
  switch (status) {
    case "PENDENTE":
      return "Pendente";
    case "APROVADO":
      return "Aprovado";
    case "REPROVADO":
      return "Reprovado";
  }
}

type ActionIconButtonProps = {
  title: string;
  className: string;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
};

function ActionIconButton({ title, className, disabled = false, onClick, children }: ActionIconButtonProps) {
  return (
    <div className="group relative inline-flex">
      <button
        type="button"
        title={title}
        aria-label={title}
        disabled={disabled}
        onClick={onClick}
        className={`inline-flex h-8 w-8 items-center justify-center rounded border shadow-sm transition-colors ${className}`}
      >
        {children}
      </button>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-[11px] text-white opacity-0 shadow transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {title}
      </span>
    </div>
  );
}

type ActionIconLinkProps = {
  title: string;
  href: string;
  className: string;
  children: ReactNode;
};

function ActionIconLink({ title, href, className, children }: ActionIconLinkProps) {
  return (
    <div className="group relative inline-flex">
      <Link
        href={href}
        title={title}
        aria-label={title}
        className={`inline-flex h-8 w-8 items-center justify-center rounded border shadow-sm transition-colors ${className}`}
      >
        {children}
      </Link>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-[11px] text-white opacity-0 shadow transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {title}
      </span>
    </div>
  );
}

export default function PosicaoFinanceiraPage() {
  const searchParams = useSearchParams();
  const [kind, setKind] = useState<Kind>("RECEBER");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [integratingId, setIntegratingId] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const extractErpMessages = (data: any): string[] => {
    if (!data) return [];
    if (Array.isArray(data?.messages)) return data.messages.map((message: any) => String(message));
    const rows = Array.isArray(data?.RowErrors) ? data.RowErrors : [];
    const out: string[] = [];
    for (const item of rows) {
      const description = String(item?.ErrorDescription || "").trim();
      if (description) out.push(description);
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
            integrated: Boolean(item.integrated),
            status: normalizeWorkflowStatus(item.status, Boolean(item.integrated)),
            approvalStatus: normalizeApprovalStatus(item.approvalStatus, Boolean(item.integrated)),
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
          messages.length > 0
            ? messages.join("\n")
            : String(data?.error || "Não foi possível integrar o título.")
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
                status: normalizeWorkflowStatus(data?.status, true),
                approvalStatus: normalizeApprovalStatus(data?.approvalStatus, true),
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

  const handleWorkflowUpdate = async (
    row: Row,
    updates: Partial<Pick<Row, "status" | "approvalStatus">>,
    successMessage: string
  ) => {
    setError(null);
    setSuccess(null);
    setUpdatingId(row.id);

    try {
      const res = await fetch(`/api/meu-financeiro/financial-titles/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(data?.error || "Não foi possível atualizar o reembolso."));
        return;
      }

      setRows((current) =>
        current.map((item) =>
          item.id === row.id
            ? {
                ...item,
                status: normalizeWorkflowStatus(data?.status, Boolean(data?.integrated ?? item.integrated)),
                approvalStatus: normalizeApprovalStatus(data?.approvalStatus, Boolean(data?.integrated ?? item.integrated)),
                integrated: Boolean(data?.integrated ?? item.integrated),
              }
            : item
        )
      );
      setSuccess(successMessage);
    } catch (err: any) {
      setError(String(err?.message || "Não foi possível atualizar o reembolso."));
    } finally {
      setUpdatingId(null);
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

        {error && (
          <div className="mt-3 whitespace-pre-line rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        {success && <div className="mt-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{success}</div>}

        <div className="mt-3 overflow-x-auto border rounded">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="p-2">Número do Título</th>
                <th className="p-2">Data Vencimento</th>
                <th className="p-2">Valor R$</th>
                <th className="p-2">Situação</th>
                <th className="p-2">Aprovação</th>
                <th className="p-2 text-center">Avaliação</th>
                <th className="p-2 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="p-3 text-gray-500">
                    Carregando títulos...
                  </td>
                </tr>
              )}
              {!loading &&
                visibleRows.map((r) => (
                <tr key={r.id} className="border-b last:border-b-0 hover:bg-gray-50">
                  <td className="p-2">
                    <span>{r.numero}</span>
                  </td>
                  <td className="p-2">{formatDateBR(r.dueDate)}</td>
                  <td className="p-2">{formatBRL(r.amount)}</td>
                  <td className="p-2">
                    <span className={getStatusBadge(r.status)}>{getStatusLabel(r.status)}</span>
                  </td>
                  <td className="p-2">
                    <span className={getApprovalBadge(r.approvalStatus)}>{getApprovalLabel(r.approvalStatus)}</span>
                  </td>
                  <td className="p-2">
                    {(() => {
                      const canApproveOrReject = r.status === "EM_AVALIACAO" && updatingId !== r.id;
                      const canReturnToPending =
                        updatingId !== r.id &&
                        (r.approvalStatus === "APROVADO" || r.approvalStatus === "REPROVADO") &&
                        (r.status === "EM_DIGITACAO" || r.status === "AGUARDANDO_INTEGRACAO");

                      return (
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <ActionIconButton
                            title="Aprovar"
                            className={
                              canApproveOrReject
                                ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                                : "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                            }
                            disabled={!canApproveOrReject}
                            onClick={() =>
                              void handleWorkflowUpdate(
                                r,
                                { approvalStatus: "APROVADO", status: "AGUARDANDO_INTEGRACAO" },
                                "Reembolso aprovado com sucesso."
                              )
                            }
                          >
                            <Check className="h-4 w-4" />
                          </ActionIconButton>
                          <ActionIconButton
                            title="Reprovar"
                            className={
                              canApproveOrReject
                                ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                                : "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                            }
                            disabled={!canApproveOrReject}
                            onClick={() =>
                              void handleWorkflowUpdate(
                                r,
                                { approvalStatus: "REPROVADO", status: "EM_DIGITACAO" },
                                "Reembolso reprovado com sucesso."
                              )
                            }
                          >
                            <X className="h-4 w-4" />
                          </ActionIconButton>
                          <ActionIconButton
                            title="Voltar para pendente"
                            className={
                              canReturnToPending
                                ? "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                                : "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                            }
                            disabled={!canReturnToPending}
                            onClick={() =>
                              void handleWorkflowUpdate(
                                r,
                                { approvalStatus: "PENDENTE", status: "EM_DIGITACAO" },
                                "Reembolso voltou para pendente."
                              )
                            }
                          >
                            <RotateCcw className="h-4 w-4" />
                          </ActionIconButton>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="p-2">
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <ActionIconButton
                        title="Enviar para avaliação"
                        className={
                          r.status === "EM_DIGITACAO" && updatingId !== r.id
                            ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                            : "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                        }
                        disabled={r.status !== "EM_DIGITACAO" || updatingId === r.id}
                        onClick={() =>
                          void handleWorkflowUpdate(
                            r,
                            { approvalStatus: "PENDENTE", status: "EM_AVALIACAO" },
                            "Reembolso enviado para avaliação."
                          )
                        }
                      >
                        <ArrowRight className="h-4 w-4" />
                      </ActionIconButton>
                      <ActionIconButton
                        title={integratingId === r.id ? "Enviando ao ERP" : "Enviar ao ERP"}
                        className={
                          r.integrated || integratingId === r.id || r.status !== "AGUARDANDO_INTEGRACAO"
                            ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                            : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                        }
                        disabled={r.integrated || integratingId === r.id || r.status !== "AGUARDANDO_INTEGRACAO"}
                        onClick={() => void handleSendToErp(r.id)}
                      >
                        {integratingId === r.id ? (
                          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
                          </svg>
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </ActionIconButton>
                      <ActionIconLink
                        title="Detalhes"
                        href={`/admin/modules/meu-financeiro/novo-reembolso?id=${r.id}`}
                        className="border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                      >
                        <Eye className="h-4 w-4" />
                      </ActionIconLink>
                      <ActionIconButton
                        title="Excluir"
                        className={
                          r.integrated
                            ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                            : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                        }
                        disabled={r.integrated}
                        onClick={() => void handleDelete(r.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </ActionIconButton>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && visibleRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-2 text-gray-500">
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
