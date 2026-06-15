"use client";

import React, { useMemo, useState } from "react";

type TabKey = "nf-itens" | "anexos" | "dados-adicionais" | "observacoes";

const TAB_ITEMS: Array<{ key: TabKey; label: string }> = [
  { key: "nf-itens", label: "NF/Itens" },
  { key: "anexos", label: "Anexos" },
  { key: "dados-adicionais", label: "Dados Adicionais" },
  { key: "observacoes", label: "Observações" },
];

const PROCESS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Selecione" },
];

function formatToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function ComplaintCreatePage() {
  const [activeTab, setActiveTab] = useState<TabKey>("nf-itens");
  const [form, setForm] = useState({
    occurrenceNumber: "",
    processSacSgq: "",
    occurrenceDate: formatToday(),
    status: "",
    customerSupplier: "",
    document: "",
    email: "",
    phone: "",
  });

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
              {PROCESS_OPTIONS.map((option) => (
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
            <label className="mb-1 block text-sm font-medium text-gray-700">Cliente/Fornec</label>
            <input
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              value={form.customerSupplier}
              onChange={(e) => updateField("customerSupplier", e.target.value)}
              placeholder="Informar cliente ou fornecedor"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">CPF/CNPJ</label>
            <input
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              value={form.document}
              onChange={(e) => updateField("document", e.target.value)}
              placeholder="Informar CPF/CNPJ"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">E-mail</label>
            <input
              type="email"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              value={form.email}
              onChange={(e) => updateField("email", e.target.value)}
              placeholder="Informar e-mail"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Telefone</label>
            <input
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              value={form.phone}
              onChange={(e) => updateField("phone", e.target.value)}
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
            <div className="flex h-full items-center justify-center rounded border border-dashed border-gray-300 bg-white p-6 text-center">
              <div>
                <p className="text-sm font-medium text-gray-800">{TAB_ITEMS.find((tab) => tab.key === activeTab)?.label}</p>
                <p className="mt-2 text-sm text-gray-600">{tabDescription}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
