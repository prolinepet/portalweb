"use client";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

type ReimbursementTypeOption = {
  id: number;
  description: string;
};

export default function NovoReembolsoPage() {
  const router = useRouter();
  const [reimbursementTypeId, setReimbursementTypeId] = useState("");
  const [reimbursementTypes, setReimbursementTypes] = useState<ReimbursementTypeOption[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [numero, setNumero] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFeedback(null);

    if (!reimbursementTypeId) {
      setFeedback("Selecione o tipo de reembolso.");
      return;
    }

    if (!description.trim()) {
      setFeedback("Informe a descrição.");
      return;
    }

    if (!value.trim()) {
      setFeedback("Informe o valor.");
      return;
    }

    if (!dueDate) {
      setFeedback("Informe a data de vencimento.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/meu-financeiro/financial-titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "PAGAR",
          reimbursementTypeId: Number(reimbursementTypeId),
          numero: numero.trim() || undefined,
          dueDate,
          amount: value,
          description: description.trim(),
          status: "ABERTO",
          integrated: false,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback(String(data?.error || "Não foi possível salvar o reembolso."));
        return;
      }

      router.push("/admin/modules/meu-financeiro/posicao-financeira?kind=PAGAR");
      router.refresh();
    } catch {
      setFeedback("Não foi possível salvar o reembolso.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Meu Financeiro • Novo Reembolso</h1>

      <div className="bg-white rounded border p-4 shadow-sm">
        <div className="text-sm text-gray-600 mb-3">Os reembolsos são gravados como títulos a pagar da entidade ativa.</div>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select
            className="border rounded px-3 py-2 bg-white"
            value={reimbursementTypeId}
            onChange={(e) => setReimbursementTypeId(e.target.value)}
            disabled={saving}
          >
            <option value="">{loadingTypes ? "Carregando tipos..." : "Tipo de reembolso"}</option>
            {reimbursementTypes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.id} - {item.description}
              </option>
            ))}
          </select>
          <input
            className="border rounded px-3 py-2"
            placeholder="Descrição"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={saving}
          />
          <input
            className="border rounded px-3 py-2"
            placeholder="Valor (R$)"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={saving}
          />
          <input
            type="date"
            className="border rounded px-3 py-2"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={saving}
          />
          <input
            className="border rounded px-3 py-2"
            placeholder="Número do título (opcional)"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            disabled={saving}
          />
          <div className="md:col-span-2 flex items-center justify-between gap-3">
            <div className={`text-sm ${feedback ? "text-red-600" : "text-gray-500"}`}>
              {feedback || "Se o número não for informado, ele será gerado automaticamente."}
            </div>
            <button
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-400"
              disabled={saving}
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
