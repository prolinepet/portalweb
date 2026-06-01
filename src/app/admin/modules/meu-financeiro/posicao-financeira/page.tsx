"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

type Status = "ABERTO" | "PAGO";
type Row = { numero: string; vencimento: string; valor: number; status: Status };
type Kind = "RECEBER" | "PAGAR";

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function formatDateBR(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
}

export default function PosicaoFinanceiraPage() {
  const [kind, setKind] = useState<Kind>("RECEBER");

  const data = useMemo(() => {
    const receber: Row[] = [
      { numero: "001/2024", vencimento: "2024-10-15", valor: 12000, status: "ABERTO" },
      { numero: "002/2024", vencimento: "2024-10-28", valor: 8500, status: "PAGO" },
      { numero: "003/2024", vencimento: "2024-11-05", valor: 14000, status: "ABERTO" },
    ];
    const pagar: Row[] = [
      { numero: "105/2024", vencimento: "2024-10-20", valor: 6250.5, status: "ABERTO" },
      { numero: "106/2024", vencimento: "2024-10-25", valor: 12000, status: "PAGO" },
    ];
    const totals = {
      RECEBER: receber.reduce((sum, r) => sum + (Number(r.valor) || 0), 0),
      PAGAR: pagar.reduce((sum, r) => sum + (Number(r.valor) || 0), 0),
    };
    return { receber, pagar, totals };
  }, []);

  const rows = kind === "RECEBER" ? data.receber : data.pagar;

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
          <Link
            href="/admin/modules/meu-financeiro/novo-reembolso"
            className="px-3 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
          >
            Criar Reembolso
          </Link>
        </div>

        <div className="mt-3 overflow-x-auto border rounded">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="p-2">Número do Título</th>
                <th className="p-2">Data Vencimento</th>
                <th className="p-2">Valor R$</th>
                <th className="p-2">Situação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.numero} className="border-b last:border-b-0">
                  <td className="p-2">{r.numero}</td>
                  <td className="p-2">{formatDateBR(r.vencimento)}</td>
                  <td className="p-2">{formatBRL(r.valor)}</td>
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
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-2 text-gray-500">
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

