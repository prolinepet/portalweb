"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type UserRow = { id: number; name: string; abbrevName?: string | null };
type OccurrenceTagRow = { code: number; description: string };

type PhaseUser = {
  id: number;
  phaseId: number;
  userId: number;
  tagCode?: number | null;
  allowReturn: boolean;
  allowNext: boolean;
  user?: UserRow | null;
  tag?: OccurrenceTagRow | null;
};

type Phase = {
  id: number;
  processId: number;
  code: number;
  description: string;
  sequence: number;
  users?: PhaseUser[];
};

type ProcessDetails = {
  id: number;
  code: number;
  description: string;
  isActive: boolean;
  phases?: Phase[];
};

function toIntOrEmpty(v: string): number | null {
  const t = String(v ?? "").trim();
  if (!t) return null;
  const n = Number(t.replace(/[^\d]+/g, ""));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function safeString(v: any): string {
  return v == null ? "" : String(v);
}

function IconButton({
  title,
  onClick,
  children,
  disabled,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center w-8 h-8 rounded-md border border-gray-300 bg-white text-gray-700 shadow-sm ${
        disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50 hover:text-gray-900"
      }`}
    >
      {children}
    </button>
  );
}

export default function ProcessEditor({ processId }: { processId?: number }) {
  const router = useRouter();
  const [id, setId] = useState<number | null>(processId ?? null);
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [selectedPhaseId, setSelectedPhaseId] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [phaseModalOpen, setPhaseModalOpen] = useState(false);
  const [phaseEditingId, setPhaseEditingId] = useState<number | null>(null);
  const [phaseCode, setPhaseCode] = useState("");
  const [phaseDesc, setPhaseDesc] = useState("");

  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUserLinkId, setEditingUserLinkId] = useState<number | null>(null);
  const [userQuery, setUserQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedTagCode, setSelectedTagCode] = useState<number | null>(null);
  const [allowReturn, setAllowReturn] = useState(false);
  const [allowNext, setAllowNext] = useState(false);

  const [usersLoading, setUsersLoading] = useState(false);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [tagsLoaded, setTagsLoaded] = useState(false);
  const [tags, setTags] = useState<OccurrenceTagRow[]>([]);

  const selectedPhase = useMemo(() => phases.find((p) => p.id === selectedPhaseId) ?? null, [phases, selectedPhaseId]);
  const selectedUser = useMemo(() => (selectedUserId ? users.find((u) => u.id === selectedUserId) ?? null : null), [users, selectedUserId]);
  const selectedTag = useMemo(() => (selectedTagCode ? tags.find((tag) => tag.code === selectedTagCode) ?? null : null), [tags, selectedTagCode]);

  const userSuggestions = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return [];
    const list = users.filter((u) => {
      const ab = String(u.abbrevName || "").toLowerCase();
      const nm = String(u.name || "").toLowerCase();
      return ab.includes(q) || nm.includes(q) || String(u.id).includes(q);
    });
    return list.slice(0, 20);
  }, [users, userQuery]);

  const load = async (pid: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sac/sgq-processes/${pid}`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(data?.error || "Falha ao carregar processo");
      const d = data as ProcessDetails;
      setId(d.id);
      setCode(String(d.code ?? ""));
      setDescription(String(d.description ?? ""));
      setIsActive(Boolean(d.isActive));
      setPhases(Array.isArray(d.phases) ? d.phases : []);
      setSelectedPhaseId((prev) => {
        const exists = prev != null && (d.phases || []).some((p) => p.id === prev);
        return exists ? prev : (d.phases?.[0]?.id ?? null);
      });
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (processId) load(processId);
  }, [processId]);

  const saveProcess = async () => {
    setSaving(true);
    setError(null);
    try {
      const codeNum = toIntOrEmpty(code);
      const desc = description.trim();
      if (!codeNum || codeNum <= 0) throw new Error("Cód Processo inválido");
      if (!desc) throw new Error("Descrição é obrigatória");

      if (!id) {
        const res = await fetch("/api/sac/sgq-processes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: codeNum, description: desc, isActive }),
        });
        const data = await res.json().catch(() => null as any);
        if (!res.ok) throw new Error(data?.error || "Falha ao criar processo");
        const createdId = Number((data as any)?.id);
        if (!Number.isFinite(createdId) || createdId <= 0) throw new Error("Falha ao criar processo");
        router.push(`/sac/sgq-processes/${createdId}`);
        return;
      }

      const res = await fetch(`/api/sac/sgq-processes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeNum, description: desc, isActive }),
      });
      const data = await res.json().catch(() => null as any);
      if (!res.ok) throw new Error(data?.error || "Falha ao salvar processo");
      await load(id);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const removeProcess = async () => {
    if (!id) return;
    if (!confirm("Confirma excluir este processo SAC/SGQ?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/sac/sgq-processes/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null as any);
      if (!res.ok) throw new Error(data?.error || "Falha ao excluir");
      router.push("/sac/sgq-processes");
    } catch (e: any) {
      alert(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const openPhaseModal = (phase?: Phase) => {
    if (phase) {
      setPhaseEditingId(phase.id);
      setPhaseCode(String(phase.code ?? ""));
      setPhaseDesc(String(phase.description ?? ""));
    } else {
      setPhaseEditingId(null);
      setPhaseCode("");
      setPhaseDesc("");
    }
    setPhaseModalOpen(true);
  };

  const savePhase = async () => {
    if (!id) return;
    const codeNum = toIntOrEmpty(phaseCode);
    const desc = phaseDesc.trim();
    if (!codeNum || codeNum <= 0) return alert("Cód Fase inválido");
    if (!desc) return alert("Descrição da fase é obrigatória");

    setSaving(true);
    try {
      let res: Response;
      if (phaseEditingId) {
        res = await fetch(`/api/sac/sgq-processes/phases/${phaseEditingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: codeNum, description: desc }),
        });
      } else {
        res = await fetch(`/api/sac/sgq-processes/${id}/phases`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: codeNum, description: desc }),
        });
      }
      const data = await res.json().catch(() => null as any);
      if (!res.ok) throw new Error(data?.error || "Falha ao salvar fase");
      setPhaseModalOpen(false);
      await load(id);
    } catch (e: any) {
      alert(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const removePhase = async (phaseId: number) => {
    if (!confirm("Confirma excluir esta fase?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/sac/sgq-processes/phases/${phaseId}`, { method: "DELETE" });
      const data = await res.json().catch(() => null as any);
      if (!res.ok) throw new Error(data?.error || "Falha ao excluir fase");
      if (id) await load(id);
    } catch (e: any) {
      alert(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const reorderPhases = async (orderedIds: number[]) => {
    if (!id) return;
    const res = await fetch(`/api/sac/sgq-processes/${id}/phases/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedPhaseIds: orderedIds }),
    });
    const data = await res.json().catch(() => null as any);
    if (!res.ok) throw new Error(data?.error || "Falha ao reordenar fases");
  };

  const movePhase = async (phaseId: number, dir: -1 | 1) => {
    if (!id) return;
    const idx = phases.findIndex((p) => p.id === phaseId);
    const nextIdx = idx + dir;
    if (idx < 0 || nextIdx < 0 || nextIdx >= phases.length) return;
    const newPhases = [...phases];
    const tmp = newPhases[idx];
    newPhases[idx] = newPhases[nextIdx];
    newPhases[nextIdx] = tmp;
    setPhases(newPhases);
    try {
      setSaving(true);
      await reorderPhases(newPhases.map((p) => p.id));
      await load(id);
    } catch (e: any) {
      alert(String(e?.message || e));
      await load(id);
    } finally {
      setSaving(false);
    }
  };

  const ensureUsersLoaded = async () => {
    if (usersLoaded || usersLoading) return;
    setUsersLoading(true);
    try {
      const res = await fetch("/api/users", { cache: "no-store" });
      const data = await res.json().catch(() => null as any);
      const arr = Array.isArray(data) ? data : [];
      setUsers(
        arr.map((u: any) => ({
          id: Number(u.id),
          name: safeString(u.name),
          abbrevName: u.abbrevName == null ? null : safeString(u.abbrevName),
        }))
      );
      setUsersLoaded(true);
    } finally {
      setUsersLoading(false);
    }
  };

  const openUserModal = (link?: PhaseUser) => {
    void ensureTagsLoaded();
    setEditingUserLinkId(link?.id ?? null);
    setSelectedUserId(link?.userId ?? null);
    setSelectedTagCode(link?.tagCode != null ? Number(link.tagCode) : null);
    setUserQuery(link?.user?.abbrevName ? String(link.user.abbrevName) : "");
    setAllowReturn(Boolean(link?.allowReturn));
    setAllowNext(Boolean(link?.allowNext));
    setUserModalOpen(true);
  };

  const ensureTagsLoaded = async () => {
    if (tagsLoaded || tagsLoading) return;
    setTagsLoading(true);
    try {
      const res = await fetch("/api/sac/occurrence-tags", { cache: "no-store" });
      const data = await res.json().catch(() => null as any);
      const arr = Array.isArray(data) ? data : [];
      setTags(
        arr.map((row: any) => ({
          code: Number(row.code),
          description: safeString(row.description),
        }))
      );
      setTagsLoaded(true);
    } finally {
      setTagsLoading(false);
    }
  };

  const savePhaseUser = async () => {
    if (!selectedPhase) return;
    if (!selectedUserId) return alert("Selecione um usuário");
    if (!selectedTagCode) return alert("Selecione uma TAG");
    setSaving(true);
    try {
      let res: Response;
      if (editingUserLinkId) {
        res = await fetch(`/api/sac/sgq-processes/phase-users/${editingUserLinkId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: selectedUserId, tagCode: selectedTagCode, allowReturn, allowNext }),
        });
      } else {
        res = await fetch(`/api/sac/sgq-processes/phases/${selectedPhase.id}/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: selectedUserId, tagCode: selectedTagCode, allowReturn, allowNext }),
        });
      }
      const data = await res.json().catch(() => null as any);
      if (!res.ok) throw new Error(data?.error || "Falha ao salvar usuário na fase");
      setUserModalOpen(false);
      if (id) await load(id);
    } catch (e: any) {
      alert(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const removePhaseUser = async (linkId: number) => {
    if (!confirm("Confirma excluir este usuário da fase?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/sac/sgq-processes/phase-users/${linkId}`, { method: "DELETE" });
      const data = await res.json().catch(() => null as any);
      if (!res.ok) throw new Error(data?.error || "Falha ao excluir usuário da fase");
      if (id) await load(id);
    } catch (e: any) {
      alert(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Manutenção de Processo SAC/SGQ</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-1.5 text-xs border rounded bg-white hover:bg-gray-100"
            onClick={() => router.push("/sac/sgq-processes")}
          >
            Voltar
          </button>
          <button
            type="button"
            className="px-3 py-1.5 text-xs border rounded bg-white text-red-600 border-red-300 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={removeProcess}
            disabled={!id || saving}
          >
            Excluir
          </button>
          <button
            type="button"
            className="px-3 py-1.5 text-xs border rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={saveProcess}
            disabled={saving}
          >
            Salvar
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}
      {loading && <div className="text-sm text-gray-600">Carregando...</div>}

      <div className="bg-white rounded border border-gray-200 p-4">
        <div className="grid grid-cols-12 gap-3 items-end">
          <div className="col-span-2">
            <label className="text-xs text-gray-600">Cód Processo</label>
            <input className="w-full mt-1 px-2 py-1.5 border rounded" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div className="col-span-8">
            <label className="text-xs text-gray-600">Descrição</label>
            <input className="w-full mt-1 px-2 py-1.5 border rounded" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <label className="inline-flex items-center gap-2 text-sm mt-6">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Ativo?
            </label>
          </div>
        </div>
      </div>

      <div className="bg-white rounded border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
          <div className="font-medium">Fases do Processo</div>
          <button
            type="button"
            onClick={() => openPhaseModal()}
            disabled={!id || saving}
            className="px-3 py-1.5 text-xs border rounded bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Incluir
          </button>
        </div>
        {!id ? (
          <div className="px-3 py-4 text-sm text-gray-600">Salve o processo para incluir fases.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 text-gray-700">
                <tr>
                  <th className="text-left px-3 py-2 w-24">Cód</th>
                  <th className="text-left px-3 py-2">Descrição Fase</th>
                  <th className="text-left px-3 py-2 w-28">Sequência</th>
                  <th className="text-center px-3 py-2 w-40">Ações</th>
                </tr>
              </thead>
              <tbody>
                {phases.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-gray-500">
                      Nenhuma fase cadastrada.
                    </td>
                  </tr>
                )}
                {phases.map((p) => {
                  const selected = p.id === selectedPhaseId;
                  return (
                    <tr
                      key={p.id}
                      className={`border-t hover:bg-gray-50 cursor-pointer ${selected ? "bg-blue-50" : ""}`}
                      onClick={() => setSelectedPhaseId(p.id)}
                    >
                      <td className="px-3 py-2 font-mono text-xs">{p.code}</td>
                      <td className="px-3 py-2">{p.description}</td>
                      <td className="px-3 py-2">
                        <div className="inline-flex gap-2" onClick={(e) => e.stopPropagation()}>
                          <IconButton title="Subir" disabled={saving} onClick={() => movePhase(p.id, -1)}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4 text-blue-600">
                              <path d="M12 5l7 7H5Z" strokeWidth="2" strokeLinejoin="round" />
                            </svg>
                          </IconButton>
                          <IconButton title="Descer" disabled={saving} onClick={() => movePhase(p.id, 1)}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4 text-blue-600">
                              <path d="M12 19l7-7H5Z" strokeWidth="2" strokeLinejoin="round" />
                            </svg>
                          </IconButton>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="inline-flex gap-2" onClick={(e) => e.stopPropagation()}>
                          <IconButton title="Modificar" disabled={saving} onClick={() => openPhaseModal(p)}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
                              <path d="M12 20h9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </IconButton>
                          <IconButton title="Eliminar" disabled={saving} onClick={() => removePhase(p.id)}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4 text-red-600">
                              <path d="M3 6h18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M8 6V4h8v2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
          <div className="font-medium">Usuários na Fase</div>
          <button
            type="button"
            onClick={() => openUserModal()}
            disabled={!id || !selectedPhase}
            className="px-3 py-1.5 text-xs border rounded bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Incluir usuário na fase
          </button>
        </div>
        {!id ? (
          <div className="px-3 py-4 text-sm text-gray-600">Salve o processo e selecione uma fase para vincular usuários.</div>
        ) : !selectedPhase ? (
          <div className="px-3 py-4 text-sm text-gray-600">Selecione uma fase para ver os usuários.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 text-gray-700">
                <tr>
                  <th className="text-left px-3 py-2 w-28">TAG</th>
                  <th className="text-left px-3 py-2 w-32">Cód Usuário</th>
                  <th className="text-left px-3 py-2">Usuário (Nome Abrev)</th>
                  <th className="text-left px-3 py-2 w-36">Permite Retornar?</th>
                  <th className="text-left px-3 py-2 w-40">Permite Próxima?</th>
                  <th className="text-center px-3 py-2 w-40">Ações</th>
                </tr>
              </thead>
              <tbody>
                {(selectedPhase.users || []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-center text-gray-500">
                      Sem usuários vinculados.
                    </td>
                  </tr>
                )}
                {(selectedPhase.users || []).map((u) => (
                  <tr key={u.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="text-sm">{u.tag?.description || "-"}</div>
                      <div className="text-xs text-gray-600">{u.tag?.code != null ? `Cód ${u.tag.code}` : "-"}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{u.user?.id ?? u.userId}</td>
                    <td className="px-3 py-2">
                      <div className="text-sm">{u.user?.abbrevName || "-"}</div>
                      <div className="text-xs text-gray-600">{u.user?.name || "-"}</div>
                    </td>
                    <td className="px-3 py-2">{u.allowReturn ? "Sim" : "Não"}</td>
                    <td className="px-3 py-2">{u.allowNext ? "Sim" : "Não"}</td>
                    <td className="px-3 py-2 text-center">
                      <div className="inline-flex gap-2">
                        <IconButton title="Modificar" disabled={saving} onClick={() => openUserModal(u)}>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
                            <path d="M12 20h9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </IconButton>
                        <IconButton title="Eliminar" disabled={saving} onClick={() => removePhaseUser(u.id)}>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4 text-red-600">
                            <path d="M3 6h18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M8 6V4h8v2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {phaseModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50" onClick={() => setPhaseModalOpen(false)}>
          <div className="bg-white w-full max-w-xl rounded shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b flex items-center">
              <div className="font-semibold">{phaseEditingId ? "Modificar Fase" : "Incluir Fase"}</div>
              <button className="ml-auto text-gray-500 hover:text-black" onClick={() => setPhaseModalOpen(false)} aria-label="Fechar">
                ×
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-3">
                  <label className="text-xs text-gray-600">Cód Fase</label>
                  <input className="w-full mt-1 px-2 py-1.5 border rounded" value={phaseCode} onChange={(e) => setPhaseCode(e.target.value)} />
                </div>
                <div className="col-span-9">
                  <label className="text-xs text-gray-600">Descrição</label>
                  <input className="w-full mt-1 px-2 py-1.5 border rounded" value={phaseDesc} onChange={(e) => setPhaseDesc(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="px-4 py-3 border-t text-right space-x-2">
              <button className="px-3 py-1.5 border rounded hover:bg-gray-100" onClick={() => setPhaseModalOpen(false)}>
                Cancelar
              </button>
              <button className="px-3 py-1.5 border rounded bg-blue-600 text-white hover:bg-blue-700" onClick={savePhase}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {userModalOpen && selectedPhase && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50" onClick={() => setUserModalOpen(false)}>
          <div className="bg-white w-full max-w-3xl rounded shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b flex items-center">
              <div className="font-semibold">{editingUserLinkId ? "Modificar Usuário na Fase" : "Incluir Usuário na Fase"}</div>
              <button className="ml-auto text-gray-500 hover:text-black" onClick={() => setUserModalOpen(false)} aria-label="Fechar">
                ×
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-3">
                  <label className="text-xs text-gray-600">Cód Processo</label>
                  <input className="w-full mt-1 px-2 py-1.5 border rounded bg-gray-50" value={code} readOnly />
                </div>
                <div className="col-span-3">
                  <label className="text-xs text-gray-600">Cód Fase</label>
                  <input className="w-full mt-1 px-2 py-1.5 border rounded bg-gray-50" value={String(selectedPhase.code)} readOnly />
                </div>
                <div className="col-span-3">
                  <label className="text-xs text-gray-600">TAG</label>
                  <select
                    className="w-full mt-1 px-2 py-1.5 border rounded"
                    value={selectedTagCode ?? ""}
                    onChange={(e) => setSelectedTagCode(e.target.value ? Number(e.target.value) : null)}
                    onFocus={() => void ensureTagsLoaded()}
                  >
                    <option value="">{tagsLoading ? "Carregando..." : "Selecione"}</option>
                    {tags.map((tag) => (
                      <option key={tag.code} value={tag.code}>
                        {tag.description}
                      </option>
                    ))}
                  </select>
                  {selectedTag && <div className="mt-1 text-xs text-gray-600">Cód: {selectedTag.code}</div>}
                </div>
                <div className="col-span-6">
                  <label className="text-xs text-gray-600">Usuário (Nome Abrev)</label>
                  <div className="relative">
                    <input
                      className="w-full mt-1 px-2 py-1.5 border rounded"
                      value={userQuery}
                      onChange={(e) => {
                        setUserQuery(e.target.value);
                        setSelectedUserId(null);
                      }}
                      onFocus={() => ensureUsersLoaded()}
                      placeholder={usersLoading ? "Carregando usuários..." : "Digite para buscar"}
                    />
                    {userSuggestions.length > 0 && !selectedUserId && (
                      <div className="absolute z-10 mt-1 w-full max-h-56 overflow-auto border rounded bg-white shadow">
                        {userSuggestions.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setSelectedUserId(u.id);
                              setUserQuery(String(u.abbrevName || ""));
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-gray-100"
                          >
                            <div className="text-sm">{u.abbrevName || "-"}</div>
                            <div className="text-xs text-gray-600">{u.name}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {selectedUser && (
                    <div className="mt-1 text-xs text-gray-600">
                      {selectedUser.name} (ID: {selectedUser.id})
                    </div>
                  )}
                </div>
              </div>

              <div className="border rounded p-3">
                <div className="font-medium mb-2">Permissões do Usuário na Fase</div>
                <div className="flex flex-wrap gap-6">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={allowReturn} onChange={(e) => setAllowReturn(e.target.checked)} />
                    Permite Retornar Fase Anterior?
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={allowNext} onChange={(e) => setAllowNext(e.target.checked)} />
                    Permite Enviar Próxima Fase?
                  </label>
                </div>
              </div>
            </div>
            <div className="px-4 py-3 border-t text-right space-x-2">
              <button className="px-3 py-1.5 border rounded hover:bg-gray-100" onClick={() => setUserModalOpen(false)}>
                Cancelar
              </button>
              <button className="px-3 py-1.5 border rounded bg-blue-600 text-white hover:bg-blue-700" onClick={savePhaseUser}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
