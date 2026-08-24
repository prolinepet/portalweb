"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type TabKey = "dados" | "anexos";

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

const TAB_ITEMS: Array<{ key: TabKey; label: string }> = [
  { key: "dados", label: "Dados" },
  { key: "anexos", label: "Anexos" },
];

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

function formatCurrencyInput(value: string | number) {
  const parsed = typeof value === "number" ? value : parseCurrencyInput(value);
  if (!Number.isFinite(parsed)) return "";

  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parsed);
}

export default function NovoReembolsoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<TabKey>("dados");
  const [reimbursementId, setReimbursementId] = useState<number | null>(null);
  const [reimbursementTypeId, setReimbursementTypeId] = useState("");
  const [reimbursementTypes, setReimbursementTypes] = useState<ReimbursementTypeOption[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [loadingReimbursement, setLoadingReimbursement] = useState(false);
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [numero, setNumero] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);

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

  const loadAttachments = useCallback(async (id: number) => {
    setAttachmentsLoading(true);
    try {
      const res = await fetch(`/api/meu-financeiro/financial-titles/${id}/attachments`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setAttachments([]);
        return;
      }
      setAttachments(Array.isArray(data.items) ? data.items : []);
    } catch {
      setAttachments([]);
    } finally {
      setAttachmentsLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = Number(searchParams?.get("id") || "");
    if (!Number.isFinite(id) || id <= 0) {
      setReimbursementId(null);
      setReimbursementTypeId("");
      setDescription("");
      setValue("");
      setDueDate(new Date().toISOString().slice(0, 10));
      setNumero("");
      setAttachments([]);
      return;
    }

    let active = true;
    setLoadingReimbursement(true);
    fetch(`/api/meu-financeiro/financial-titles/${id}`, { cache: "no-store" })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(async ({ ok, data }) => {
        if (!active) return;
        if (!ok || !data?.id) {
          setFeedback(String(data?.error || "Não foi possível carregar o reembolso."));
          return;
        }

        setReimbursementId(Number(data.id));
        setReimbursementTypeId(data.reimbursementTypeId ? String(data.reimbursementTypeId) : "");
        setDescription(String(data.description || ""));
        setValue(formatCurrencyInput(Number(data.amount || 0)));
        setDueDate(String(data.dueDate || "").slice(0, 10) || new Date().toISOString().slice(0, 10));
        setNumero(String(data.numero || ""));
        await loadAttachments(Number(data.id));
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
  }, [loadAttachments, searchParams]);

  const isBusy = saving || loadingReimbursement;

  const pendingSummary = useMemo(() => {
    if (pendingFiles.length === 0) return "Nenhum arquivo selecionado.";
    return `${pendingFiles.length} arquivo(s) pronto(s) para envio.`;
  }, [pendingFiles.length]);

  const uploadFiles = useCallback(
    async (id: number, files: File[]) => {
      if (files.length === 0) return;
      setUploadingAttachments(true);
      try {
        const formData = new FormData();
        for (const file of files) formData.append("files", file);

        const res = await fetch(`/api/meu-financeiro/financial-titles/${id}/attachments`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          throw new Error(String(data?.error || "Não foi possível enviar os anexos."));
        }

        setPendingFiles([]);
        setFileInputKey((current) => current + 1);
        await loadAttachments(id);
      } finally {
        setUploadingAttachments(false);
      }
    },
    [loadAttachments]
  );

  const validateForm = () => {
    if (!reimbursementTypeId) return "Selecione o tipo de reembolso.";
    if (!description.trim()) return "Informe a descrição.";
    if (!value.trim()) return "Informe o valor.";
    if (!dueDate) return "Informe a data de vencimento.";
    return null;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFeedback(null);
    setSuccess(null);

    const validationError = validateForm();
    if (validationError) {
      setFeedback(validationError);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        kind: "RECEBER",
        reimbursementTypeId: Number(reimbursementTypeId),
        numero: numero.trim() || undefined,
        dueDate,
        amount: value,
        description: description.trim(),
        status: "ABERTO",
        integrated: false,
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
      if (Number.isFinite(nextId) && nextId > 0) {
        setReimbursementId(nextId);
        router.replace(`/admin/modules/meu-financeiro/novo-reembolso?id=${nextId}`);
        if (pendingFiles.length > 0) {
          await uploadFiles(nextId, pendingFiles);
          setActiveTab("anexos");
          setSuccess("Reembolso salvo e anexos enviados com sucesso.");
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

  const handleQueueFiles = (files: FileList | null) => {
    const nextFiles = Array.from(files || []).filter((file) => file.size > 0);
    if (nextFiles.length === 0) return;
    setPendingFiles((current) => [...current, ...nextFiles]);
    setFeedback(null);
    setSuccess(null);
  };

  const handleUploadPendingFiles = async () => {
    if (!reimbursementId) {
      setFeedback("Salve o reembolso primeiro para enviar os anexos.");
      return;
    }
    if (pendingFiles.length === 0) {
      setFeedback("Selecione ao menos um arquivo.");
      return;
    }

    setFeedback(null);
    setSuccess(null);
    try {
      await uploadFiles(reimbursementId, pendingFiles);
      setSuccess("Anexos enviados com sucesso.");
    } catch (err: any) {
      setFeedback(String(err?.message || "Não foi possível enviar os anexos."));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Meu Financeiro • Novo Reembolso</h1>
        <Link
          href="/admin/modules/meu-financeiro/posicao-financeira?kind=RECEBER"
          className="rounded border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
        >
          Voltar
        </Link>
      </div>

      <div className="rounded border bg-white shadow-sm">
        <div className="flex flex-wrap gap-2 border-b border-gray-200 px-4 pt-4">
          {TAB_ITEMS.map((tab) => {
            const selected = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-t-md border border-b-0 px-4 py-2 text-sm ${
                  selected
                    ? "border-gray-300 bg-white font-medium text-gray-900"
                    : "border-transparent bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="rounded-b border-t-0 border-gray-200 bg-gray-50 p-4">
          {feedback && <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{feedback}</div>}
          {success && <div className="mb-4 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{success}</div>}

          {activeTab === "dados" ? (
            <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <select
                className="rounded border px-3 py-2 bg-white"
                value={reimbursementTypeId}
                onChange={(e) => setReimbursementTypeId(e.target.value)}
                disabled={isBusy}
              >
                <option value="">{loadingTypes ? "Carregando tipos..." : "Tipo de reembolso"}</option>
                {reimbursementTypes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id} - {item.description}
                  </option>
                ))}
              </select>

              <input
                className="rounded border px-3 py-2"
                placeholder="Descrição"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isBusy}
              />

              <input
                className="rounded border px-3 py-2"
                placeholder="Valor (R$)"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onBlur={() => setValue((current) => formatCurrencyInput(current) || current)}
                inputMode="decimal"
                disabled={isBusy}
              />

              <input
                type="date"
                className="rounded border px-3 py-2"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={isBusy}
              />

              <input
                className="rounded border px-3 py-2 md:col-span-2"
                placeholder="Número do título (opcional)"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                disabled={isBusy}
              />

              <div className="md:col-span-2 flex items-center justify-between gap-3">
                <div className="text-sm text-gray-500">
                  {reimbursementId ? `Reembolso #${reimbursementId} em edição.` : pendingSummary}
                </div>
                <button
                  className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-blue-400"
                  disabled={isBusy}
                >
                  {saving ? "Salvando..." : reimbursementId ? "Atualizar" : "Salvar"}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="rounded border border-gray-200 bg-white p-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end">
                  <div className="md:col-span-8">
                    <label className="mb-1 block text-sm font-medium text-gray-700">Selecionar arquivos</label>
                    <input
                      key={fileInputKey}
                      type="file"
                      multiple
                      className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
                      onChange={(e) => handleQueueFiles(e.target.files)}
                      disabled={uploadingAttachments}
                    />
                  </div>

                  <div className="md:col-span-4 flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:bg-blue-400"
                      disabled={uploadingAttachments || pendingFiles.length === 0}
                      onClick={() => void handleUploadPendingFiles()}
                    >
                      {uploadingAttachments ? "Enviando..." : "Enviar anexos"}
                    </button>
                    <button
                      type="button"
                      className="rounded border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
                      disabled={uploadingAttachments || pendingFiles.length === 0}
                      onClick={() => {
                        setPendingFiles([]);
                        setFileInputKey((current) => current + 1);
                      }}
                    >
                      Limpar fila
                    </button>
                  </div>

                  {!reimbursementId && (
                    <div className="md:col-span-12 text-sm text-amber-700">
                      Salve o reembolso primeiro. Os arquivos que você selecionar ficam em fila e podem ser enviados junto no primeiro salvamento.
                    </div>
                  )}
                </div>

                <div className="mt-4 rounded border border-dashed border-gray-300 bg-gray-50 p-3">
                  <div className="mb-2 text-sm font-medium text-gray-700">Arquivos na fila</div>
                  {pendingFiles.length === 0 ? (
                    <div className="text-sm text-gray-500">Nenhum arquivo selecionado.</div>
                  ) : (
                    <div className="space-y-2">
                      {pendingFiles.map((file, index) => (
                        <div key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between gap-3 rounded border bg-white px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-gray-800">{file.name}</div>
                            <div className="text-xs text-gray-500">{formatBytes(file.size)}</div>
                          </div>
                          <button
                            type="button"
                            className="rounded border border-red-300 bg-white px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                            onClick={() => setPendingFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))}
                          >
                            Remover
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="overflow-hidden rounded border border-gray-200 bg-white">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-100 text-gray-700">
                      <tr>
                        <th className="px-3 py-2 text-left">Arquivo</th>
                        <th className="px-3 py-2 text-left w-32">Data</th>
                        <th className="px-3 py-2 text-left w-24">Hora</th>
                        <th className="px-3 py-2 text-left w-48">Usuário</th>
                        <th className="px-3 py-2 text-left w-24">Tamanho</th>
                        <th className="px-3 py-2 text-center w-28">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attachmentsLoading && (
                        <tr className="border-t">
                          <td colSpan={6} className="px-3 py-4 text-center text-gray-500">
                            Carregando anexos...
                          </td>
                        </tr>
                      )}

                      {!attachmentsLoading && attachments.length === 0 && (
                        <tr className="border-t">
                          <td colSpan={6} className="px-3 py-4 text-center text-gray-500">
                            Nenhum anexo enviado.
                          </td>
                        </tr>
                      )}

                      {!attachmentsLoading &&
                        attachments.map((attachment) => (
                          <tr key={attachment.id} className="border-t hover:bg-gray-50">
                            <td className="px-3 py-2">
                              <div className="font-medium text-gray-800">{attachment.originalFileName}</div>
                              <div className="text-xs text-gray-500">{attachment.mimeType || "Arquivo"}</div>
                            </td>
                            <td className="px-3 py-2">{formatDatePtBR(attachment.createdAt)}</td>
                            <td className="px-3 py-2">{formatTimePtBR(attachment.createdAt)}</td>
                            <td className="px-3 py-2">{attachment.createdBy?.abbrevName || attachment.createdBy?.name || "-"}</td>
                            <td className="px-3 py-2">{formatBytes(attachment.sizeBytes)}</td>
                            <td className="px-3 py-2 text-center">
                              {reimbursementId ? (
                                <a
                                  className="inline-flex rounded border border-blue-300 bg-white px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-50"
                                  href={`/api/meu-financeiro/financial-titles/${reimbursementId}/attachments/${attachment.id}/download`}
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
