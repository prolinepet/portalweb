"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

type ReimbursementTypeOption = {
  id: number;
  description: string;
};

type AttachmentRow = {
  id: number;
  originalFileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  createdBy?: { id: number; name: string; abbrevName: string | null } | null;
};

type ExpenseItemRow = {
  id: number | null;
  clientKey: string;
  reimbursementTypeId: string;
  description: string;
  amount: string;
  pendingFiles: File[];
  attachments: AttachmentRow[];
  attachmentsLoaded: boolean;
  attachmentsLoading: boolean;
  expanded: boolean;
  attachmentCount: number;
};

function formatDatePtBR(value: string) {
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? "" : dt.toLocaleDateString("pt-BR");
}

function formatTimePtBR(value: string) {
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? "" : dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatBytes(value: number | null) {
  if (!value || value <= 0) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function parseCurrencyInput(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return NaN;

  const normalized = raw.replace(/\s+/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function formatCurrencyWhileTyping(value: string) {
  const sanitized = String(value || "").replace(/[^\d,]/g, "");
  if (!sanitized) return "";

  const hasComma = sanitized.includes(",");
  const [integerPartRaw, decimalPartRaw = ""] = sanitized.split(",", 2);
  const integerDigits = integerPartRaw.replace(/\D/g, "");
  const decimalDigits = decimalPartRaw.replace(/\D/g, "").slice(0, 2);

  const integerFormatted = integerDigits
    ? new Intl.NumberFormat("pt-BR", {
        maximumFractionDigits: 0,
      }).format(Number(integerDigits))
    : hasComma
      ? "0"
      : "";

  return hasComma ? `${integerFormatted},${decimalDigits}` : integerFormatted;
}

function formatCurrencyInput(value: string | number) {
  const parsed = typeof value === "number" ? value : parseCurrencyInput(value);
  if (!Number.isFinite(parsed)) return "";

  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parsed);
}

function createClientKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `expense-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function mapExpenseItemFromApi(item: any): ExpenseItemRow {
  return {
    id: Number(item?.id || 0) || null,
    clientKey: `persisted-${item?.id}`,
    reimbursementTypeId: item?.reimbursementTypeId ? String(item.reimbursementTypeId) : "",
    description: String(item?.description || ""),
    amount: formatCurrencyInput(Number(item?.amount || 0)),
    pendingFiles: [],
    attachments: [],
    attachmentsLoaded: false,
    attachmentsLoading: false,
    expanded: false,
    attachmentCount: Number(item?._count?.attachments || 0),
  };
}

export default function NovoReembolsoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [reimbursementId, setReimbursementId] = useState<number | null>(null);
  const [reimbursementTypes, setReimbursementTypes] = useState<ReimbursementTypeOption[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [loadingReimbursement, setLoadingReimbursement] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [draftTypeId, setDraftTypeId] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftValue, setDraftValue] = useState("");
  const [draftFiles, setDraftFiles] = useState<File[]>([]);
  const [editingClientKey, setEditingClientKey] = useState<string | null>(null);
  const [draftFileInputKey, setDraftFileInputKey] = useState(0);

  const [expenseItems, setExpenseItems] = useState<ExpenseItemRow[]>([]);

  useEffect(() => {
    let active = true;
    setLoadingTypes(true);
    fetch("/api/base/reimbursement-types", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        setReimbursementTypes(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!active) return;
        setReimbursementTypes([]);
      })
      .finally(() => {
        if (!active) return;
        setLoadingTypes(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const loadExpenseAttachments = useCallback(async (titleId: number, expenseItemId: number) => {
    const res = await fetch(`/api/meu-financeiro/financial-titles/${titleId}/expense-items/${expenseItemId}/attachments`, {
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      throw new Error(String(data?.error || "Não foi possível carregar os anexos da despesa."));
    }
    return Array.isArray(data.items) ? (data.items as AttachmentRow[]) : [];
  }, []);

  useEffect(() => {
    const id = Number(searchParams?.get("id") || "");
    if (!Number.isFinite(id) || id <= 0) {
      setReimbursementId(null);
      setReadOnly(false);
      setExpenseItems([]);
      setDraftTypeId("");
      setDraftDescription("");
      setDraftValue("");
      setDraftFiles([]);
      setEditingClientKey(null);
      return;
    }

    let active = true;
    setLoadingReimbursement(true);
    fetch(`/api/meu-financeiro/financial-titles/${id}`, { cache: "no-store" })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!active) return;
        if (!ok || !data?.id) {
          setFeedback(String(data?.error || "Não foi possível carregar o reembolso."));
          return;
        }

        const nextExpenseItems = Array.isArray(data?.expenseItems) && data.expenseItems.length > 0
          ? data.expenseItems.map(mapExpenseItemFromApi)
          : [];

        setReimbursementId(Number(data.id));
        setReadOnly(Boolean(data.integrated));
        setExpenseItems(nextExpenseItems);
        setDraftTypeId("");
        setDraftDescription("");
        setDraftValue("");
        setDraftFiles([]);
        setEditingClientKey(null);
        setDraftFileInputKey((current) => current + 1);
      })
      .catch(() => {
        if (!active) return;
        setFeedback("Não foi possível carregar o reembolso.");
      })
      .finally(() => {
        if (!active) return;
        setLoadingReimbursement(false);
      });

    return () => {
      active = false;
    };
  }, [searchParams]);

  const reimbursementTypeMap = useMemo(
    () =>
      new Map(
        reimbursementTypes.map((item) => [String(item.id), `${item.id} - ${item.description}`])
      ),
    [reimbursementTypes]
  );

  const totalAmount = useMemo(
    () =>
      expenseItems.reduce((sum, item) => {
        const parsed = parseCurrencyInput(item.amount);
        return Number.isFinite(parsed) ? sum + parsed : sum;
      }, 0),
    [expenseItems]
  );

  const isBusy = saving || loadingReimbursement;
  const isReadOnly = readOnly && reimbursementId !== null;
  const editingRow = editingClientKey ? expenseItems.find((item) => item.clientKey === editingClientKey) || null : null;

  const resetDraft = useCallback(() => {
    setDraftTypeId("");
    setDraftDescription("");
    setDraftValue("");
    setDraftFiles([]);
    setEditingClientKey(null);
    setDraftFileInputKey((current) => current + 1);
  }, []);

  const validateDraft = () => {
    if (!draftTypeId) return "Selecione o tipo de despesa.";
    if (!draftDescription.trim()) return "Informe a descrição da despesa.";
    if (!draftValue.trim()) return "Informe o valor da despesa.";
    const parsed = parseCurrencyInput(draftValue);
    if (!Number.isFinite(parsed) || parsed <= 0) return "Valor da despesa inválido.";
    return null;
  };

  const handleAddOrUpdateExpense = () => {
    setFeedback(null);
    setSuccess(null);

    if (isReadOnly) {
      setFeedback("Este reembolso ja foi integrado e esta disponivel apenas para visualizacao.");
      return;
    }

    const validationError = validateDraft();
    if (validationError) {
      setFeedback(validationError);
      return;
    }

    if (editingClientKey) {
      setExpenseItems((current) =>
        current.map((item) =>
          item.clientKey === editingClientKey
            ? {
                ...item,
                reimbursementTypeId: draftTypeId,
                description: draftDescription.trim(),
                amount: formatCurrencyInput(draftValue) || draftValue,
                pendingFiles: [...draftFiles],
              }
            : item
        )
      );
      setSuccess("Despesa atualizada na grade. Salve o reembolso para persistir.");
    } else {
      setExpenseItems((current) => [
        ...current,
        {
          id: null,
          clientKey: createClientKey(),
          reimbursementTypeId: draftTypeId,
          description: draftDescription.trim(),
          amount: formatCurrencyInput(draftValue) || draftValue,
          pendingFiles: [...draftFiles],
          attachments: [],
          attachmentsLoaded: true,
          attachmentsLoading: false,
          expanded: false,
          attachmentCount: 0,
        },
      ]);
      setSuccess("Despesa adicionada na grade. Salve o reembolso para persistir.");
    }

    resetDraft();
  };

  const handleEditExpense = (clientKey: string) => {
    const item = expenseItems.find((row) => row.clientKey === clientKey);
    if (!item) return;

    setDraftTypeId(item.reimbursementTypeId);
    setDraftDescription(item.description);
    setDraftValue(formatCurrencyInput(item.amount) || item.amount);
    setDraftFiles([...item.pendingFiles]);
    setEditingClientKey(item.clientKey);
    setDraftFileInputKey((current) => current + 1);
    setFeedback(null);
    setSuccess(null);
  };

  const handleDeleteExpense = (clientKey: string) => {
    if (isReadOnly) {
      setFeedback("Este reembolso ja foi integrado e esta disponivel apenas para visualizacao.");
      return;
    }

    setExpenseItems((current) => current.filter((item) => item.clientKey !== clientKey));
    if (editingClientKey === clientKey) {
      resetDraft();
    }
    setFeedback(null);
    setSuccess(null);
  };

  const handleToggleAttachments = async (clientKey: string) => {
    const item = expenseItems.find((row) => row.clientKey === clientKey);
    if (!item) return;

    if (!item.id || !reimbursementId || item.attachmentsLoaded) {
      setExpenseItems((current) =>
        current.map((row) =>
          row.clientKey === clientKey
            ? { ...row, expanded: !row.expanded }
            : row
        )
      );
      return;
    }

    setExpenseItems((current) =>
      current.map((row) =>
        row.clientKey === clientKey
          ? { ...row, expanded: true, attachmentsLoading: true }
          : row
      )
    );

    try {
      const attachments = await loadExpenseAttachments(reimbursementId, item.id);
      setExpenseItems((current) =>
        current.map((row) =>
          row.clientKey === clientKey
            ? {
                ...row,
                expanded: true,
                attachmentsLoading: false,
                attachmentsLoaded: true,
                attachments,
                attachmentCount: attachments.length,
              }
            : row
        )
      );
    } catch (err: any) {
      setExpenseItems((current) =>
        current.map((row) =>
          row.clientKey === clientKey
            ? { ...row, attachmentsLoading: false }
            : row
        )
      );
      setFeedback(String(err?.message || "Não foi possível carregar os anexos da despesa."));
    }
  };

  const uploadFilesForExpense = useCallback(
    async (titleId: number, expenseItemId: number, files: File[]) => {
      if (files.length === 0) return [];

      const formData = new FormData();
      for (const file of files) {
        formData.append("files", file);
      }

      const res = await fetch(`/api/meu-financeiro/financial-titles/${titleId}/expense-items/${expenseItemId}/attachments`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(String(data?.error || "Não foi possível enviar os anexos da despesa."));
      }

      return Array.isArray(data.items) ? (data.items as AttachmentRow[]) : [];
    },
    []
  );

  const handleSaveReimbursement = async () => {
    setFeedback(null);
    setSuccess(null);

    if (isReadOnly) {
      setFeedback("Este reembolso ja foi integrado e esta disponivel apenas para visualizacao.");
      return;
    }

    if (editingRow) {
      setFeedback("Finalize a edicao da despesa atual antes de salvar o reembolso.");
      return;
    }

    if (expenseItems.length === 0) {
      setFeedback("Adicione ao menos uma despesa ao reembolso.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        kind: "RECEBER",
        status: "ABERTO",
        integrated: false,
        expenseItems: expenseItems.map((item) => ({
          id: item.id || undefined,
          clientKey: item.clientKey,
          reimbursementTypeId: Number(item.reimbursementTypeId),
          description: item.description.trim(),
          amount: item.amount,
        })),
      };

      const endpoint = reimbursementId
        ? `/api/meu-financeiro/financial-titles/${reimbursementId}`
        : "/api/meu-financeiro/financial-titles";
      const method = reimbursementId ? "PATCH" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback(String(data?.error || "Não foi possível salvar o reembolso."));
        return;
      }

      const nextId = Number(data?.id || reimbursementId);
      const returnedItems = Array.isArray(data?.expenseItems) ? data.expenseItems : [];
      const returnedByClientKey = new Map<string, any>();
      const returnedById = new Map<number, any>();

      for (const item of returnedItems) {
        if (item?.clientKey) returnedByClientKey.set(String(item.clientKey), item);
        if (Number(item?.id) > 0) returnedById.set(Number(item.id), item);
      }

      let nextExpenseItems = expenseItems.map((item) => {
        const matched =
          returnedByClientKey.get(item.clientKey) ||
          (item.id ? returnedById.get(item.id) : null);

        if (!matched) return item;

        return {
          ...item,
          id: Number(matched.id || item.id || 0) || item.id,
          reimbursementTypeId: matched.reimbursementTypeId ? String(matched.reimbursementTypeId) : item.reimbursementTypeId,
          description: String(matched.description || item.description),
          amount: formatCurrencyInput(Number(matched.amount || 0)) || item.amount,
          attachmentCount: Number(matched?._count?.attachments || item.attachmentCount || 0),
        };
      });

      if (Number.isFinite(nextId) && nextId > 0) {
        const uploadErrors: string[] = [];

        for (const item of nextExpenseItems) {
          if (!item.id || item.pendingFiles.length === 0) continue;

          try {
            const uploadedAttachments = await uploadFilesForExpense(nextId, item.id, item.pendingFiles);
            nextExpenseItems = nextExpenseItems.map((row) =>
              row.clientKey === item.clientKey
                ? {
                    ...row,
                    pendingFiles: [],
                    attachmentsLoaded: row.attachmentsLoaded,
                    attachments: row.attachmentsLoaded ? [...uploadedAttachments, ...row.attachments] : row.attachments,
                    attachmentCount: row.attachmentCount + uploadedAttachments.length,
                  }
                : row
            );
          } catch (err: any) {
            uploadErrors.push(String(err?.message || "Não foi possível enviar um ou mais anexos."));
          }
        }

        setExpenseItems(nextExpenseItems);
        setReimbursementId(nextId);
        router.replace(`/admin/modules/meu-financeiro/novo-reembolso?id=${nextId}`);

        if (uploadErrors.length > 0) {
          setFeedback(uploadErrors.join(" "));
          setSuccess(reimbursementId ? "Reembolso atualizado, mas houve falha em alguns anexos." : "Reembolso salvo, mas houve falha em alguns anexos.");
        } else {
          setSuccess(reimbursementId ? "Reembolso atualizado com sucesso." : "Reembolso salvo com sucesso.");
        }
      }
    } catch (err: any) {
      setFeedback(String(err?.message || "Não foi possível salvar o reembolso."));
    } finally {
      setSaving(false);
    }
  };

  const queuedFilesSummary = useMemo(() => {
    const totalQueuedFiles = expenseItems.reduce((sum, item) => sum + item.pendingFiles.length, 0) + draftFiles.length;
    if (totalQueuedFiles === 0) return "Nenhum anexo em fila.";
    return `${totalQueuedFiles} anexo(s) em fila para envio no proximo salvamento.`;
  }, [draftFiles.length, expenseItems]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">
          Meu Financeiro • {isReadOnly ? "Visualizar Reembolso" : reimbursementId ? "Editar Reembolso" : "Novo Reembolso"}
        </h1>
        <Link
          href="/admin/modules/meu-financeiro/posicao-financeira?kind=RECEBER"
          className="rounded border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
        >
          Voltar
        </Link>
      </div>

      <div className="rounded border bg-white shadow-sm">
        <div className="bg-gray-50 p-4">
          {feedback && <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{feedback}</div>}
          {success && <div className="mb-4 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{success}</div>}
          {isReadOnly && (
            <div className="mb-4 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
              Este reembolso ja foi integrado ao ERP. As despesas e os anexos estao disponiveis apenas para visualizacao.
            </div>
          )}

          <div className="space-y-4 rounded border border-gray-200 bg-white p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <select
                className="rounded border px-3 py-2 bg-white"
                value={draftTypeId}
                onChange={(e) => setDraftTypeId(e.target.value)}
                disabled={isBusy || isReadOnly}
              >
                <option value="">{loadingTypes ? "Carregando tipos..." : "Tipo de despesa"}</option>
                {reimbursementTypes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id} - {item.description}
                  </option>
                ))}
              </select>

              <input
                className="rounded border px-3 py-2"
                placeholder="Descricao"
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
                disabled={isBusy || isReadOnly}
              />

              <input
                className="rounded border px-3 py-2"
                placeholder="Valor (R$)"
                value={draftValue}
                onChange={(e) => setDraftValue(formatCurrencyWhileTyping(e.target.value))}
                onBlur={() => setDraftValue((current) => formatCurrencyInput(current) || current)}
                inputMode="decimal"
                disabled={isBusy || isReadOnly}
              />
            </div>

            <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-4">
              <div className="mb-3 text-sm font-medium text-gray-700">
                {editingRow ? "Anexos da despesa em edicao" : "Anexos da despesa"}
              </div>

              {!isReadOnly && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto] md:items-end">
                  <input
                    key={draftFileInputKey}
                    type="file"
                    multiple
                    className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
                    onChange={(e) => {
                      const nextFiles = Array.from(e.target.files || []).filter((file) => file.size > 0);
                      if (nextFiles.length === 0) return;
                      setDraftFiles((current) => [...current, ...nextFiles]);
                      setDraftFileInputKey((current) => current + 1);
                    }}
                    disabled={isBusy}
                  />

                  <button
                    type="button"
                    className="rounded border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
                    disabled={isBusy || draftFiles.length === 0}
                    onClick={() => {
                      setDraftFiles([]);
                      setDraftFileInputKey((current) => current + 1);
                    }}
                  >
                    Limpar anexos
                  </button>
                </div>
              )}

              <div className="mt-3 space-y-2">
                {draftFiles.length === 0 ? (
                  <div className="text-sm text-gray-500">Nenhum anexo selecionado para esta despesa.</div>
                ) : (
                  draftFiles.map((file, index) => (
                    <div
                      key={`${file.name}-${file.size}-${index}`}
                      className="flex items-center justify-between gap-3 rounded border bg-white px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-gray-800">{file.name}</div>
                        <div className="text-xs text-gray-500">{formatBytes(file.size)}</div>
                      </div>
                      {!isReadOnly && (
                        <button
                          type="button"
                          className="rounded border border-red-300 bg-white px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                          onClick={() =>
                            setDraftFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))
                          }
                        >
                          Remover
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

              {editingRow && editingRow.attachmentCount > 0 && (
                <div className="mt-3 text-xs text-gray-500">
                  Esta despesa ja possui {editingRow.attachmentCount} anexo(s) salvo(s). Use o botao Anexos na grade para visualiza-los.
                </div>
              )}
            </div>

            {!isReadOnly && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {editingRow && (
                  <button
                    type="button"
                    className="rounded border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50"
                    onClick={() => resetDraft()}
                  >
                    Cancelar edicao
                  </button>
                )}
                <button
                  type="button"
                  className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:bg-blue-400"
                  disabled={isBusy}
                  onClick={() => handleAddOrUpdateExpense()}
                >
                  {editingRow ? "Atualizar despesa" : "Adicionar despesa"}
                </button>
              </div>
            )}
          </div>

          <div className="mt-4 overflow-hidden rounded border border-gray-200 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100 text-gray-700">
                  <tr>
                    <th className="px-3 py-2 text-left">Tipo de despesa</th>
                    <th className="px-3 py-2 text-left">Descricao</th>
                    <th className="px-3 py-2 text-left w-36">Valor</th>
                    <th className="px-3 py-2 text-center w-72">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingReimbursement && (
                    <tr className="border-t">
                      <td colSpan={4} className="px-3 py-4 text-center text-gray-500">
                        Carregando reembolso...
                      </td>
                    </tr>
                  )}

                  {!loadingReimbursement && expenseItems.length === 0 && (
                    <tr className="border-t">
                      <td colSpan={4} className="px-3 py-4 text-center text-gray-500">
                        Nenhuma despesa adicionada.
                      </td>
                    </tr>
                  )}

                  {!loadingReimbursement &&
                    expenseItems.map((item) => (
                      <Fragment key={item.clientKey}>
                        <tr key={item.clientKey} className="border-t hover:bg-gray-50">
                          <td className="px-3 py-2">{reimbursementTypeMap.get(item.reimbursementTypeId) || "-"}</td>
                          <td className="px-3 py-2">{item.description || "-"}</td>
                          <td className="px-3 py-2">{formatCurrencyInput(item.amount) || item.amount}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap items-center justify-center gap-2">
                              <button
                                type="button"
                                className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs hover:bg-gray-50"
                                onClick={() => void handleToggleAttachments(item.clientKey)}
                              >
                                {item.expanded ? "Ocultar anexos" : `Anexos${item.attachmentCount > 0 ? ` (${item.attachmentCount})` : ""}`}
                              </button>
                              {!isReadOnly && (
                                <>
                                  <button
                                    type="button"
                                    className="rounded border border-blue-300 bg-white px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-50"
                                    onClick={() => handleEditExpense(item.clientKey)}
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded border border-red-300 bg-white px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                                    onClick={() => handleDeleteExpense(item.clientKey)}
                                  >
                                    Excluir
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>

                        {item.expanded && (
                          <tr key={`${item.clientKey}-attachments`} className="border-t bg-gray-50">
                            <td colSpan={4} className="px-4 py-3">
                              <div className="space-y-3 rounded border border-gray-200 bg-white p-4">
                                {item.attachmentsLoading ? (
                                  <div className="text-sm text-gray-500">Carregando anexos...</div>
                                ) : (
                                  <>
                                    {item.pendingFiles.length > 0 && (
                                      <div className="space-y-2">
                                        <div className="text-sm font-medium text-gray-700">Arquivos em fila para esta despesa</div>
                                        {item.pendingFiles.map((file, index) => (
                                          <div
                                            key={`${item.clientKey}-${file.name}-${file.size}-${index}`}
                                            className="flex items-center justify-between rounded border px-3 py-2 text-sm"
                                          >
                                            <div>
                                              <div className="font-medium text-gray-800">{file.name}</div>
                                              <div className="text-xs text-gray-500">{formatBytes(file.size)}</div>
                                            </div>
                                            <div className="text-xs text-amber-700">Sera enviado ao salvar o reembolso</div>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {item.attachments.length > 0 ? (
                                      <div className="space-y-2">
                                        <div className="text-sm font-medium text-gray-700">Anexos salvos</div>
                                        <div className="overflow-x-auto">
                                          <table className="min-w-full text-sm">
                                            <thead className="bg-gray-100 text-gray-700">
                                              <tr>
                                                <th className="px-3 py-2 text-left">Arquivo</th>
                                                <th className="px-3 py-2 text-left w-28">Data</th>
                                                <th className="px-3 py-2 text-left w-24">Hora</th>
                                                <th className="px-3 py-2 text-left w-44">Usuario</th>
                                                <th className="px-3 py-2 text-left w-24">Tamanho</th>
                                                <th className="px-3 py-2 text-center w-24">Acao</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {item.attachments.map((attachment) => (
                                                <tr key={attachment.id} className="border-t">
                                                  <td className="px-3 py-2">
                                                    <div className="font-medium text-gray-800">{attachment.originalFileName}</div>
                                                    <div className="text-xs text-gray-500">{attachment.mimeType || "Arquivo"}</div>
                                                  </td>
                                                  <td className="px-3 py-2">{formatDatePtBR(attachment.createdAt)}</td>
                                                  <td className="px-3 py-2">{formatTimePtBR(attachment.createdAt)}</td>
                                                  <td className="px-3 py-2">
                                                    {attachment.createdBy?.abbrevName || attachment.createdBy?.name || "-"}
                                                  </td>
                                                  <td className="px-3 py-2">{formatBytes(attachment.sizeBytes)}</td>
                                                  <td className="px-3 py-2 text-center">
                                                    {reimbursementId && item.id ? (
                                                      <a
                                                        className="inline-flex rounded border border-blue-300 bg-white px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-50"
                                                        href={`/api/meu-financeiro/financial-titles/${reimbursementId}/expense-items/${item.id}/attachments/${attachment.id}/download`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                      >
                                                        Abrir
                                                      </a>
                                                    ) : (
                                                      "-"
                                                    )}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    ) : item.pendingFiles.length === 0 ? (
                                      <div className="text-sm text-gray-500">Nenhum anexo vinculado a esta despesa.</div>
                                    ) : null}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 rounded border border-gray-200 bg-white p-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1 text-sm text-gray-600">
              <div>
                {reimbursementId
                  ? isReadOnly
                    ? `Reembolso #${reimbursementId} em visualizacao.`
                    : `Reembolso #${reimbursementId} em edicao.`
                  : "Novo reembolso em montagem."}
              </div>
              <div>{expenseItems.length} despesa(s) no reembolso.</div>
              <div>Total do reembolso: {formatCurrencyInput(totalAmount) || "0,00"}</div>
              <div>{queuedFilesSummary}</div>
            </div>

            {!isReadOnly && (
              <button
                type="button"
                className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-blue-400"
                disabled={isBusy}
                onClick={() => void handleSaveReimbursement()}
              >
                {saving ? "Salvando..." : reimbursementId ? "Atualizar reembolso" : "Salvar reembolso"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
