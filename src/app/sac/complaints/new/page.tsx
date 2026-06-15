"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type TabKey = "nf-itens" | "anexos" | "dados-adicionais" | "observacoes" | "andamento";

const TAB_ITEMS: Array<{ key: TabKey; label: string }> = [
  { key: "nf-itens", label: "NF/Itens" },
  { key: "anexos", label: "Anexos" },
  { key: "dados-adicionais", label: "Dados Adicionais" },
  { key: "observacoes", label: "Observações" },
  { key: "andamento", label: "Andamento" },
];

type UserRow = { id: number; name: string; abbrevName?: string | null };
type PhaseUserRow = {
  id: number;
  userId: number;
  sequence?: number;
  user?: UserRow | null;
};
type PhaseRow = {
  id: number;
  code: number;
  description: string;
  sequence: number;
  users?: PhaseUserRow[];
};
type ProcessDetails = {
  id: number;
  code: number;
  description: string;
  isActive: boolean;
  phases?: PhaseRow[];
};
type SacSgqProcessRow = { id: number; code: number; description: string; isActive: boolean };

const minChars = 1;

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

export default function ComplaintCreatePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>("nf-itens");
  const [processOptions, setProcessOptions] = useState<Array<{ value: string; label: string }>>([{ value: "", label: "Selecione" }]);
  const [processDetails, setProcessDetails] = useState<ProcessDetails | null>(null);
  const [selectedNextUserId, setSelectedNextUserId] = useState<number | null>(null);
  const [loadingProcess, setLoadingProcess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    occurrenceNumber: "",
    processSacSgq: "",
    occurrenceDate: formatToday(),
    clientId: null as number | null,
    customerName: "",
    document: "",
    email: "",
    phone: "",
    currentPhaseId: null as number | null,
    responsibleUserId: null as number | null,
  });

  const selectedPhase = useMemo(() => {
    const phases = Array.isArray(processDetails?.phases) ? processDetails?.phases : [];
    return phases.find((phase) => phase.id === form.currentPhaseId) ?? null;
  }, [form.currentPhaseId, processDetails]);

  const phaseUsers = useMemo(() => {
    const list = Array.isArray(selectedPhase?.users) ? selectedPhase.users : [];
    return [...list].sort((a, b) => {
      const sa = Number(a.sequence ?? 0);
      const sb = Number(b.sequence ?? 0);
      if (sa !== sb) return sa - sb;
      return Number(a.id) - Number(b.id);
    });
  }, [selectedPhase]);

  const currentResponsibleIndex = useMemo(
    () => phaseUsers.findIndex((row) => Number(row.userId) === Number(form.responsibleUserId)),
    [form.responsibleUserId, phaseUsers]
  );

  const currentResponsible = currentResponsibleIndex >= 0 ? phaseUsers[currentResponsibleIndex] : null;
  const previousResponsible = currentResponsibleIndex > 0 ? phaseUsers[currentResponsibleIndex - 1] : null;
  const nextUsers = currentResponsibleIndex >= 0 ? phaseUsers.slice(currentResponsibleIndex + 1) : phaseUsers.slice(1);

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
      case "andamento":
        return "";
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

  useEffect(() => {
    const processId = Number(form.processSacSgq);
    if (!Number.isFinite(processId) || processId <= 0) {
      setProcessDetails(null);
      setSelectedNextUserId(null);
      setForm((current) => ({
        ...current,
        currentPhaseId: null,
        responsibleUserId: null,
      }));
      return;
    }

    let cancelled = false;
    setLoadingProcess(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/sac/sgq-processes/${processId}`, { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as any;
        if (!res.ok) throw new Error(data?.error || "Falha ao carregar processo SAC/SGQ");
        if (cancelled) return;
        const details = data as ProcessDetails;
        const firstPhase = Array.isArray(details?.phases) ? details.phases[0] ?? null : null;
        const firstUser = Array.isArray(firstPhase?.users) ? firstPhase?.users[0] ?? null : null;
        setProcessDetails(details);
        setSelectedNextUserId(null);
        setForm((current) => ({
          ...current,
          currentPhaseId: firstPhase?.id ?? null,
          responsibleUserId: firstUser?.userId ?? null,
        }));
      } catch (e: any) {
        if (cancelled) return;
        setProcessDetails(null);
        setSelectedNextUserId(null);
        setForm((current) => ({
          ...current,
          currentPhaseId: null,
          responsibleUserId: null,
        }));
        setError(String(e?.message || e));
      } finally {
        if (!cancelled) setLoadingProcess(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [form.processSacSgq]);

  useEffect(() => {
    setSelectedNextUserId((current) => {
      if (nextUsers.length === 0) return null;
      const exists = current != null && nextUsers.some((item) => Number(item.userId) === Number(current));
      return exists ? current : Number(nextUsers[0].userId);
    });
  }, [nextUsers]);

  const currentPhaseLabel = selectedPhase ? `${selectedPhase.code} - ${selectedPhase.description}` : "";
  const currentResponsibleLabel = currentResponsible?.user?.abbrevName || currentResponsible?.user?.name || "";
  const previousResponsibleLabel = previousResponsible?.user?.abbrevName || previousResponsible?.user?.name || "";

  function moveToPreviousResponsible() {
    if (!previousResponsible) return;
    setForm((current) => ({ ...current, responsibleUserId: Number(previousResponsible.userId) }));
  }

  function moveToSelectedNextResponsible() {
    if (!selectedNextUserId) return;
    setForm((current) => ({ ...current, responsibleUserId: Number(selectedNextUserId) }));
  }

  async function saveComplaint() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/sac/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occurrenceDate: form.occurrenceDate,
          sacSgqProcessId: form.processSacSgq ? Number(form.processSacSgq) : null,
          sacSgqPhaseId: form.currentPhaseId,
          responsibleUserId: form.responsibleUserId,
          previousUserId: previousResponsible?.userId ?? null,
          nextUserId: selectedNextUserId,
          counterpartyCode: form.clientId != null ? String(form.clientId) : form.document || null,
          counterpartyName: form.customerName || null,
          contactPhone: form.phone || null,
          contactEmail: form.email || null,
        }),
      });
      const data = await res.json().catch(() => null as any);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Falha ao salvar reclamação");
      router.push("/sac/complaints/search");
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Cadastro de Reclamação</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
            onClick={() => router.push("/sac/complaints/search")}
          >
            Voltar
          </button>
          <button
            type="button"
            disabled={saving || loadingProcess}
            className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={saveComplaint}
          >
            Salvar
          </button>
        </div>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nr Ocorr</label>
            <input
              className="w-full rounded border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-700"
              value={form.occurrenceNumber}
              readOnly
              placeholder="Automático"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Data Ocorr</label>
            <input
              type="date"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              value={form.occurrenceDate}
              onChange={(e) => updateField("occurrenceDate", e.target.value)}
            />
          </div>

          <div>
            <AsyncSelect
              label="Cliente"
              value={form.customerName}
              onChange={(val) => {
                setForm((prev) => ({ ...prev, customerName: val, clientId: null }));
              }}
              onSelectObj={(c) => {
                const doc = c?.doc != null ? String(c.doc) : "";
                const email = c?.email != null ? String(c.email) : "";
                const phone = c?.phone != null ? String(c.phone) : c?.telefone != null ? String(c.telefone) : "";
                setForm((prev) => ({
                  ...prev,
                  customerName: String(c?.name || prev.customerName || ""),
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
            <label className="mb-1 block text-sm font-medium text-gray-700">Fase Atual</label>
            <input
              className="w-full rounded border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-700"
              value={currentPhaseLabel}
              readOnly
              placeholder={loadingProcess ? "Carregando fase..." : "Selecione o processo"}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Responsável</label>
            <input
              className="w-full rounded border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-700"
              value={currentResponsibleLabel}
              readOnly
              placeholder={loadingProcess ? "Carregando responsável..." : "Sem responsável"}
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
            {activeTab === "andamento" ? (
              <div className="rounded border border-gray-200 bg-white p-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto] md:items-end">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Usuário Anterior</label>
                    <input
                      className="w-full rounded border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-700"
                      value={previousResponsibleLabel}
                      readOnly
                      placeholder="Sem usuário anterior"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!previousResponsible || saving}
                    className="rounded border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={moveToPreviousResponsible}
                  >
                    Voltar ao anterior
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto] md:items-end">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Próximo Usuário</label>
                    <select
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                      value={selectedNextUserId ?? ""}
                      onChange={(e) => setSelectedNextUserId(e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">Selecione</option>
                      {nextUsers.map((item) => (
                        <option key={item.id} value={item.userId}>
                          {item.user?.abbrevName || item.user?.name || `Usuário ${item.userId}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    disabled={!selectedNextUserId || saving}
                    className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={moveToSelectedNextResponsible}
                  >
                    Enviar ao próximo
                  </button>
                </div>
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
