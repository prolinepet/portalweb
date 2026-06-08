"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type ReimbursementTypeDetails = {
  id: number;
  description: string;
};

function Tabs({ active }: { active: "list" | "maint" }) {
  return (
    <div className="flex items-center gap-2 border-b">
      <Link
        href="/base/reimbursement-types"
        className={`px-3 py-2 text-sm ${active === "list" ? "border-b-2 border-blue-600 font-medium" : "text-gray-600"}`}
      >
        Listagem
      </Link>
      <Link
        href="/base/reimbursement-types/maintenance"
        className={`px-3 py-2 text-sm ${active === "maint" ? "border-b-2 border-blue-600 font-medium" : "text-gray-600"}`}
      >
        Manutenção
      </Link>
    </div>
  );
}

export default function ReimbursementTypeMaintenancePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idParam = searchParams?.get("id") ?? null;
  const id = idParam ? Number(idParam) : null;

  const [mode, setMode] = useState<"new" | "view" | "edit">("new");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ id: string; description: string }>({ id: "", description: "" });
  const originalRef = useRef<{ id: string; description: string } | null>(null);

  const reimbursementTypeId = id && Number.isFinite(id) && id > 0 ? Math.trunc(id) : null;
  const canEdit = mode === "new" || mode === "edit";

  const load = useCallback(async (rowId: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/base/reimbursement-types/${rowId}`, { cache: "no-store" });
      const data = (await res.json()) as ReimbursementTypeDetails;
      if (!res.ok) throw new Error((data as any)?.error || `Erro ${res.status}`);
      const nextForm = { id: String(data.id), description: String(data.description || "") };
      setForm(nextForm);
      originalRef.current = nextForm;
      setMode("view");
    } catch (e: any) {
      setError(e?.message || String(e));
      setMode("new");
      setForm({ id: "", description: "" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (reimbursementTypeId) {
      void load(reimbursementTypeId);
      return;
    }
    setMode("new");
    setForm({ id: "", description: "" });
    originalRef.current = null;
  }, [load, reimbursementTypeId]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const payload = { description: form.description.trim() };
      if (mode === "new") {
        const res = await fetch("/api/base/reimbursement-types", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
        router.replace(`/base/reimbursement-types/maintenance?id=${data.id}`);
      } else if (mode === "edit" && reimbursementTypeId) {
        const res = await fetch(`/api/base/reimbursement-types/${reimbursementTypeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
        await load(reimbursementTypeId);
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
    setForm({ id: "", description: "" });
  };

  const remove = async () => {
    if (!reimbursementTypeId) return;
    if (!confirm("Excluir este tipo de reembolso?")) return;
    try {
      const res = await fetch(`/api/base/reimbursement-types/${reimbursementTypeId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      router.push("/base/reimbursement-types");
    } catch (e: any) {
      alert(e?.message || String(e));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Administração Tipo Reembolso</h1>
        <button onClick={() => router.push("/base/reimbursement-types")} className="px-3 py-2 rounded border text-sm">
          Voltar
        </button>
      </div>

      <Tabs active="maint" />

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="border rounded p-3 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
          <div>
            <label className="text-xs text-gray-600">Código</label>
            <input
              value={form.id}
              disabled
              className="w-full border rounded px-2 py-1 text-sm bg-gray-50"
              placeholder="Automático"
            />
          </div>
          <div className="md:col-span-3">
            <label className="text-xs text-gray-600">Descrição</label>
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              disabled={!canEdit}
              className={`w-full border rounded px-2 py-1 text-sm ${canEdit ? "" : "bg-gray-50"}`}
            />
          </div>
          <div className="md:col-span-2 flex items-end justify-end">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button onClick={() => router.push("/base/reimbursement-types/maintenance")} className="px-3 py-2 rounded border text-sm">
                Novo
              </button>
              <button
                onClick={() => void save()}
                disabled={saving || !canEdit}
                className={`px-3 py-2 rounded text-sm ${saving || !canEdit ? "bg-gray-200 text-gray-600" : "bg-blue-600 text-white"}`}
              >
                Salvar
              </button>
              {mode === "view" && reimbursementTypeId ? (
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
