"use client";
import { useEffect, useState } from "react";

type ReimbursementTypeOption = {
  id: number;
  description: string;
};

export default function NovoReembolsoPage() {
  const [reimbursementTypeId, setReimbursementTypeId] = useState("");
  const [reimbursementTypes, setReimbursementTypes] = useState<ReimbursementTypeOption[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");

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

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Meu Financeiro • Novo Reembolso</h1>

      <div className="bg-white rounded border p-4 shadow-sm">
        <div className="text-sm text-gray-600 mb-3">Cadastro básico (em evolução).</div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!reimbursementTypeId) {
              alert("Selecione o tipo de reembolso.");
              return;
            }
            alert("Reembolso: funcionalidade em desenvolvimento.");
          }}
          className="grid grid-cols-1 md:grid-cols-4 gap-2"
        >
          <select
            className="border rounded px-3 py-2 bg-white"
            value={reimbursementTypeId}
            onChange={(e) => setReimbursementTypeId(e.target.value)}
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
          />
          <input
            className="border rounded px-3 py-2"
            placeholder="Valor (R$)"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Salvar</button>
        </form>
      </div>
    </div>
  );
}
