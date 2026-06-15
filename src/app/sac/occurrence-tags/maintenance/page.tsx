"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type OccurrenceTagDetails = {
  code: number;
  description: string;
};

function Tabs({ active }: { active: "list" | "maint" }) {
  return (
    <div className="flex items-center gap-2 border-b">
      <Link
        href="/sac/occurrence-tags"
        className={`px-3 py-2 text-sm ${active === "list" ? "border-b-2 border-blue-600 font-medium" : "text-gray-600"}`}
      >
        Listagem
      </Link>
      <Link
        href="/sac/occurrence-tags/maintenance"
        className={`px-3 py-2 text-sm ${active === "maint" ? "border-b-2 border-blue-600 font-medium" : "text-gray-600"}`}
      >
        Manutenção
      </Link>
    </div>
  );
}

export default function OccurrenceTagMaintenancePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const codeParam = searchParams?.get("code") ?? null;
  const codeFromQuery = codeParam ? Number(codeParam) : null;

  const [mode, setMode] = useState<"new" | "view" | "edit">("new");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ code: string; description: string }>({ code: "", description: "" });
  const originalRef = useRef<{ code: string; description: string } | null>(null);

  const code = codeFromQuery && Number.isFinite(codeFromQuery) && codeFromQuery > 0 ? Math.trunc(codeFromQuery) : null;
  const canEdit = mode === "new" || mode === "edit";

  const load = useCallback(async (tagCode: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sac/occurrence-tags/${tagCode}`, { cache: "no-store" });
      const data = (await res.json()) as OccurrenceTagDetails;
      if (!res.ok) throw new Error((data as any)?.error || `Erro ${res.status}`);
      const nextForm = { code: String(data.code), description: String(data.description || "") };
      setForm(nextForm);
      originalRef.current = nextForm;
      setMode("view");
    } catch (e: any) {
      setError(e?.message || String(e));
      setMode("new");
      setForm({ code: "", description: "" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (code) {
      void load(code);
      return;
    }
    setMode("new");
    setForm({ code: "", description: "" });
    originalRef.current = null;
  }, [code, load]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const codeValue = Number(form.code);
      const description = form.description.trim();
      const payload = { code: codeValue, description };

      if (!Number.isFinite(codeValue) || codeValue <= 0 || !Number.isInteger(codeValue)) {
        throw new Error("Cód Tag inválido");
      }

      if (String(Math.trunc(codeValue)).length > 6) {
        throw new Error("Cód Tag excede 6 dígitos");
      }

      if (!description) {
        throw new Error("Descrição é obrigatória");
      }

      if (description.length > 60) {
        throw new Error("Descrição excede 60 caracteres");
      }

      if (mode === "new") {
        const res = await fetch("/api/sac/occurrence-tags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
        router.replace(`/sac/occurrence-tags/maintenance?code=${data.code}`);
      } else if (mode === "edit" && code) {
        const res = await fetch(`/api/sac/occurrence-tags/${code}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
        await load(code);
      }
    } catch (e: any) {
      alert(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    if (mode === "edit" && originalRef.current) {
      setForm({ ...originalRef.current });
      setMode("view");
      return;
    }
    setMode("new");
    setForm({ code: "", description: "" });
  };

  const remove = async () => {
    if (!code) return;
    if (!confirm("Excluir esta TAG?")) return;
    try {
      const res = await fetch(`/api/sac/occurrence-tags/${code}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      router.push("/sac/occurrence-tags");
    } catch (e: any) {
      alert(e?.message || String(e));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">SAC/SGQ • Tags Da Ocorrência</h1>
        <button onClick={() => router.push("/sac/occurrence-tags")} className="px-3 py-2 rounded border text-sm">
          Voltar
        </button>
      </div>

      <Tabs active="maint" />

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="border rounded p-3 space-y-3 bg-white">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
          <div>
            <label className="text-xs text-gray-600">Cód Tag</label>
            <input
              type="number"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              disabled={!canEdit || mode !== "new"}
              className={`w-full border rounded px-2 py-1 text-sm ${canEdit && mode === "new" ? "" : "bg-gray-50"}`}
              placeholder="Até 6 dígitos"
            />
          </div>
          <div className="md:col-span-3">
            <label className="text-xs text-gray-600">Descrição</label>
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              disabled={!canEdit}
              maxLength={60}
              className={`w-full border rounded px-2 py-1 text-sm ${canEdit ? "" : "bg-gray-50"}`}
            />
          </div>
          <div className="md:col-span-2 flex items-end justify-end">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button onClick={() => router.push("/sac/occurrence-tags/maintenance")} className="px-3 py-2 rounded border text-sm">
                Novo
              </button>
              <button
                onClick={() => void save()}
                disabled={saving || !canEdit}
                className={`px-3 py-2 rounded text-sm ${saving || !canEdit ? "bg-gray-200 text-gray-600" : "bg-blue-600 text-white"}`}
              >
                Salvar
              </button>
              {mode === "view" && code ? (
                <>
                  <button onClick={() => setMode("edit")} className="px-3 py-2 rounded border text-sm">
                    Editar
                  </button>
                  <button onClick={() => void remove()} className="px-3 py-2 rounded border text-sm text-red-600">
                    Excluir
                  </button>
                </>
              ) : (
                <button onClick={cancel} className="px-3 py-2 rounded border text-sm">
                  Cancelar
                </button>
              )}
            </div>
          </div>
        </div>
        {loading && <div className="text-sm text-gray-500">Carregando...</div>}
      </div>
    </div>
  );
}
