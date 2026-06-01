"use client";
import { useState } from "react";

export default function NovoReembolsoPage() {
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Meu Financeiro • Novo Reembolso</h1>

      <div className="bg-white rounded border p-4 shadow-sm">
        <div className="text-sm text-gray-600 mb-3">Cadastro básico (em evolução).</div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            alert("Reembolso: funcionalidade em desenvolvimento.");
          }}
          className="grid grid-cols-1 md:grid-cols-3 gap-2"
        >
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

