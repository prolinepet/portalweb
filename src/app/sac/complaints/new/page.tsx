"use client";

import React, { useEffect, useMemo, useState } from "react";

type TabKey = "nf-itens" | "anexos" | "dados-adicionais" | "observacoes";

const TAB_ITEMS: Array<{ key: TabKey; label: string }> = [
  { key: "nf-itens", label: "NF/Itens" },
  { key: "anexos", label: "Anexos" },
  { key: "dados-adicionais", label: "Dados Adicionais" },
  { key: "observacoes", label: "Observações" },
];

type SacSgqProcessRow = { id: number; code: number; description: string; isActive: boolean };

const minChars = 1;

type AttachmentRow = {
  id: number;
  description: string;
  originalFileName: string;
  createdAt: string;
  createdBy?: { id: number; name: string; abbrevName?: string | null } | null;
};

const AsyncSelect = ({
  label,
  value,
  onChange,
  onSelectObj,
  fetchUrl,
  placeholder,
  renderOption,
  getLabel,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  onSelectObj?: (obj: any) => void;
  fetchUrl: (q: string) => string;
  placeholder?: string;
  renderOption: (item: any) => React.ReactNode;
  getLabel: (item: any) => string;
}) => {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<any[]>([]);
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const q = (value || "").trim();
    if (q.length < minChars) {
      setOpts([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(fetchUrl(q), { cache: "no-store" });
        const data = await res.json().catch(() => null as any);
        if (!res.ok) {
          setOpts([]);
          return;
        }
        setOpts(Array.isArray(data) ? data : []);
      } catch {
        setOpts([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [value, fetchUrl]);

  return (
    <div ref={wrapperRef} className="relative">
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <input
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && opts.length > 0 && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded border border-gray-200 bg-white shadow">
          {opts.map((item, idx) => (
            <button
              key={idx}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-gray-50"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const label = getLabel(item);
                onChange(label);
                onSelectObj?.(item);
                setOpen(false);
              }}
            >
              {renderOption(item)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

function formatToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDatePtBR(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear());
  return `${day}/${month}/${year}`;
}

function formatTimePtBR(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export default function ComplaintCreatePage() {
  const [activeTab, setActiveTab] = useState<TabKey>("nf-itens");
  const [processOptions, setProcessOptions] = useState<Array<{ value: string; label: string }>>([{ value: "", label: "Selecione" }]);
  const [form, setForm] = useState({
    occurrenceNumber: "",
    processSacSgq: "",
    occurrenceDate: formatToday(),
    status: "",
    clientId: null as number | null,
    customerSupplier: "",
    document: "",
    email: "",
    phone: "",
    observations: "",
  });

  const [complaintId, setComplaintId] = useState<number | null>(null);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentsSaving, setAttachmentsSaving] = useState(false);
  const [attachmentDescription, setAttachmentDescription] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [editingAttachmentId, setEditingAttachmentId] = useState<number | null>(null);

  const tabDescription = useMemo(() => {
    switch (activeTab) {
      case "nf-itens":
        return "Aba reservada para os campos de NF/Itens que serão detalhados posteriormente.";
      case "anexos":
        return "Aba reservada para os campos de Anexos que serão detalhados posteriormente.";
      case "dados-adicionais":
        return "Aba reservada para os campos de Dados Adicionais que serão detalhados posteriormente.";
      case "observacoes":
        return "Aba reservada para os campos de Observações que serão detalhados posteriormente.";
      default:
        return "";
    }
  }, [activeTab]);

  function updateField<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/sac/sgq-processes", { cache: "no-store" });
        const data = await res.json().catch(() => null as any);
        const rows: SacSgqProcessRow[] = Array.isArray(data) ? (data as any) : [];
        const active = rows.filter((r) => Boolean((r as any)?.isActive));
        const options = [
          { value: "", label: "Selecione" },
          ...active.map((r) => ({
            value: String(r.id),
            label: `${r.code} - ${r.description}`,
          })),
        ];
        setProcessOptions(options);
      } catch {
        setProcessOptions([{ value: "", label: "Selecione" }]);
      }
    })();
  }, []);

  const loadAttachments = async (id: number) => {
    setAttachmentsLoading(true);
    try {
      const res = await fetch(`/api/sac/complaints/${id}/attachments`, { cache: "no-store" });
      const data = await res.json().catch(() => null as any);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Falha ao carregar anexos");
      const list = Array.isArray(data?.items) ? (data.items as any[]) : [];
      setAttachments(
        list.map((r) => ({
          id: Number(r.id),
          description: String(r.description || ""),
          originalFileName: String(r.originalFileName || ""),
          createdAt: String(r.createdAt || ""),
          createdBy: r.createdBy ?? null,
        }))
      );
    } finally {
      setAttachmentsLoading(false);
    }
  };

  const ensureComplaintId = async (): Promise<number> => {
    if (complaintId) return complaintId;
    const res = await fetch("/api/sac/complaints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        occurrenceDate: form.occurrenceDate,
        sacSgqProcessId: form.processSacSgq ? Number(form.processSacSgq) : null,
        counterpartyCode: form.clientId != null ? String(form.clientId) : form.document || null,
        counterpartyName: form.customerSupplier || null,
        contactPhone: form.phone || null,
        contactEmail: form.email || null,
      }),
    });
    const data = await res.json().catch(() => null as any);
    if (!res.ok || !data?.ok) throw new Error(data?.error || "Falha ao criar reclamação");
    const id = Number(data?.id);
    if (!Number.isFinite(id) || id <= 0) throw new Error("Falha ao criar reclamação");
    setComplaintId(id);
    setForm((prev) => ({ ...prev, occurrenceNumber: String(id) }));
    await loadAttachments(id);
    return id;
  };

  function resetAttachmentForm() {
    setEditingAttachmentId(null);
    setAttachmentDescription("");
    setAttachmentFile(null);
    const input = document.getElementById("complaint-attachment-file") as HTMLInputElement | null;
    if (input) input.value = "";
  }

  function startEditAttachment(att: AttachmentRow) {
    setEditingAttachmentId(att.id);
    setAttachmentDescription(att.description);
    setAttachmentFile(null);
    const input = document.getElementById("complaint-attachment-file") as HTMLInputElement | null;
    if (input) input.value = "";
  }

  async function deleteAttachment(id: number) {
    if (!complaintId) return;
    if (!confirm("Confirma excluir este anexo?")) return;
    setAttachmentsSaving(true);
    try {
      const res = await fetch(`/api/sac/complaints/${complaintId}/attachments/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null as any);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Falha ao excluir anexo");
      await loadAttachments(complaintId);
      if (editingAttachmentId === id) resetAttachmentForm();
    } catch (e: any) {
      alert(String(e?.message || e));
    } finally {
      setAttachmentsSaving(false);
    }
  }

  async function saveAttachment() {
    const desc = attachmentDescription.trim();
    if (!desc) return alert("Informe a descrição");

    setAttachmentsSaving(true);
    try {
      const id = await ensureComplaintId();
      const fd = new FormData();
      fd.append("description", desc);
      if (attachmentFile) fd.append("file", attachmentFile);

      let res: Response;
      if (editingAttachmentId) {
        res = await fetch(`/api/sac/complaints/${id}/attachments/${editingAttachmentId}`, { method: "PUT", body: fd });
      } else {
        if (!attachmentFile) return alert("Selecione um arquivo");
        res = await fetch(`/api/sac/complaints/${id}/attachments`, { method: "POST", body: fd });
      }
      const data = await res.json().catch(() => null as any);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Falha ao salvar anexo");
      await loadAttachments(id);
      resetAttachmentForm();
    } catch (e: any) {
      alert(String(e?.message || e));
    } finally {
      setAttachmentsSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Cadastro de Reclamação</h1>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nr. Ocorrência</label>
            <input
              className="w-full rounded border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-700"
              value={form.occurrenceNumber}
              readOnly
              placeholder="Automático"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Processo SAC/SGQ</label>
            <select
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              value={form.processSacSgq}
              onChange={(e) => updateField("processSacSgq", e.target.value)}
            >
              {processOptions.map((option) => (
                <option key={option.value || "empty"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Data Ocorrência</label>
            <input
              type="date"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              value={form.occurrenceDate}
              onChange={(e) => updateField("occurrenceDate", e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Situação</label>
            <input
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              value={form.status}
              onChange={(e) => updateField("status", e.target.value)}
              placeholder="Informar situação"
            />
          </div>

          <div>
            <AsyncSelect
              label="Cliente/Fornec"
              value={form.customerSupplier}
              onChange={(val) => {
                setForm((prev) => ({ ...prev, customerSupplier: val, clientId: null }));
              }}
              onSelectObj={(c) => {
                const doc = c?.doc != null ? String(c.doc) : "";
                const email = c?.email != null ? String(c.email) : "";
                const phone = c?.phone != null ? String(c.phone) : c?.telefone != null ? String(c.telefone) : "";
                setForm((prev) => ({
                  ...prev,
                  customerSupplier: String(c?.name || prev.customerSupplier || ""),
                  clientId: c?.id != null ? Number(c.id) : null,
                  document: doc || prev.document,
                  email: email || prev.email,
                  phone: phone || prev.phone,
                }));
              }}
              fetchUrl={(q) => `/api/base/clients?q=${encodeURIComponent(q)}`}
              placeholder="Busque por nome ou documento"
              getLabel={(c) => String(c?.name || "")}
              renderOption={(c) => (
                <div>
                  <div className="font-medium">{String(c?.name || "")}</div>
                  <div className="text-xs text-gray-500">{String(c?.doc || "")}</div>
                </div>
              )}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">CPF/CNPJ</label>
            <input
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              value={form.document}
              onChange={(e) => setForm((prev) => ({ ...prev, document: e.target.value, clientId: null }))}
              placeholder="Informar CPF/CNPJ"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">E-mail</label>
            <input
              type="email"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value, clientId: null }))}
              placeholder="Informar e-mail"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Telefone</label>
            <input
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              value={form.phone}
              onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value, clientId: null }))}
              placeholder="Informar telefone"
            />
          </div>
        </div>

        <div className="border-t border-gray-200 px-4 pt-4">
          <div className="flex flex-wrap gap-2 border-b border-gray-200">
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

          <div className="min-h-[180px] rounded-b-lg border border-t-0 border-gray-200 bg-gray-50 p-4">
            {activeTab === "anexos" ? (
              <div className="space-y-4">
                <div className="rounded border border-gray-200 bg-white p-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end">
                    <div className="md:col-span-8">
                      <label className="mb-1 block text-sm font-medium text-gray-700">Descrição</label>
                      <input
                        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                        value={attachmentDescription}
                        onChange={(e) => setAttachmentDescription(e.target.value)}
                        placeholder="Informar descrição"
                      />
                    </div>
                    <div className="md:col-span-4">
                      <label className="mb-1 block text-sm font-medium text-gray-700">Arquivo</label>
                      <input
                        id="complaint-attachment-file"
                        type="file"
                        className="w-full rounded border border-gray-300 px-3 py-2 text-sm bg-white"
                        onChange={(e) => setAttachmentFile(e.target.files?.[0] ?? null)}
                      />
                    </div>
                    <div className="md:col-span-12 flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
                        disabled={attachmentsSaving}
                        onClick={saveAttachment}
                      >
                        {editingAttachmentId ? "Alterar" : "Anexar"}
                      </button>
                      <button
                        type="button"
                        className="rounded border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
                        disabled={attachmentsSaving}
                        onClick={resetAttachmentForm}
                      >
                        Limpar
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded border border-gray-200 bg-white overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-100 text-gray-700">
                        <tr>
                          <th className="text-left px-3 py-2">Descrição</th>
                          <th className="text-left px-3 py-2 w-32">Data Inclusão</th>
                          <th className="text-left px-3 py-2 w-28">Hora Inclusão</th>
                          <th className="text-left px-3 py-2 w-56">Usuário Inclusão</th>
                          <th className="text-center px-3 py-2 w-40">Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(attachmentsLoading || attachmentsSaving) && (
                          <tr className="border-t">
                            <td colSpan={5} className="px-3 py-4 text-center text-gray-500">
                              Carregando...
                            </td>
                          </tr>
                        )}
                        {!attachmentsLoading && !attachmentsSaving && attachments.length === 0 && (
                          <tr className="border-t">
                            <td colSpan={5} className="px-3 py-4 text-center text-gray-500">
                              Sem arquivos anexados.
                            </td>
                          </tr>
                        )}
                        {!attachmentsLoading &&
                          !attachmentsSaving &&
                          attachments.map((a) => (
                          <tr key={a.id} className="border-t hover:bg-gray-50">
                            <td className="px-3 py-2">
                              <div className="text-sm">{a.description}</div>
                              <a
                                className="text-xs text-blue-700 hover:underline"
                                href={
                                  complaintId
                                    ? `/api/sac/complaints/${complaintId}/attachments/${a.id}/download`
                                    : undefined
                                }
                                target="_blank"
                                rel="noreferrer"
                              >
                                {a.originalFileName}
                              </a>
                            </td>
                            <td className="px-3 py-2">
                              {(() => {
                                const dt = new Date(a.createdAt);
                                return Number.isNaN(dt.getTime()) ? "" : formatDatePtBR(dt);
                              })()}
                            </td>
                            <td className="px-3 py-2">
                              {(() => {
                                const dt = new Date(a.createdAt);
                                return Number.isNaN(dt.getTime()) ? "" : formatTimePtBR(dt);
                              })()}
                            </td>
                            <td className="px-3 py-2">{a.createdBy?.abbrevName || a.createdBy?.name || "-"}</td>
                            <td className="px-3 py-2 text-center">
                              <div className="inline-flex gap-2">
                                <button
                                  type="button"
                                  className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs hover:bg-gray-50"
                                  onClick={() => startEditAttachment(a)}
                                >
                                  Alterar
                                </button>
                                <button
                                  type="button"
                                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                                  onClick={() => deleteAttachment(a.id)}
                                >
                                  Excluir
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
            ) : activeTab === "observacoes" ? (
              <div className="rounded border border-gray-200 bg-white p-4">
                <label className="mb-1 block text-sm font-medium text-gray-700">Observações</label>
                <textarea
                  rows={6}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  value={form.observations}
                  onChange={(e) => updateField("observations", e.target.value)}
                  placeholder="Informar observações"
                />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded border border-dashed border-gray-300 bg-white p-6 text-center">
                <div>
                  <p className="text-sm font-medium text-gray-800">{TAB_ITEMS.find((tab) => tab.key === activeTab)?.label}</p>
                  <p className="mt-2 text-sm text-gray-600">{tabDescription}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
