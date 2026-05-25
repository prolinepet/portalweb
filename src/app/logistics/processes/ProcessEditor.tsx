"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type UserItem = { id: number; name: string; abbrevName?: string | null };

type NotifiedUser = {
  id: number;
  phaseId: number;
  userId: number;
  allowReturn: boolean;
  allowNext: boolean;
  permissions?: any;
  user?: { id: number; name: string; abbrevName?: string | null } | null;
};

type Phase = {
  id: number;
  processId: number;
  code: number;
  description: string;
  isAuto: boolean;
  isCarga: boolean;
  isDescarga: boolean;
  sequence: number;
  notifiedUsers?: NotifiedUser[];
};

type ProcessDetails = {
  id: number;
  code: number;
  description: string;
  isActive: boolean;
  phases: Phase[];
};

const PERMISSION_GROUPS: Array<{ title: string; items: Array<{ key: string; label: string }> }> = [
  {
    title: "Aba Processos",
    items: [
      { key: "proc_header", label: "Alterar Dados Cabeçalho" },
      { key: "proc_pre_carga", label: "Alterar Pré-Carga" },
      { key: "proc_descarga", label: "Alterar Descarga" },
      { key: "proc_devolucao", label: "Alterar Devolução" },
      { key: "proc_adicional", label: "Alterar Adicional" },
      { key: "proc_varredura", label: "Alterar Varredura" },
      { key: "proc_imprimir_romaneio", label: "Imprimir Romaneio" },
      { key: "proc_imprimir_nfe", label: "Imprimir NFE" },
      { key: "proc_imprimir_pre_fatura", label: "Imprimir Pré-Fatura" },
      { key: "proc_imprimir_ticket_balanca", label: "Imprimir Ticket Balança" },
    ],
  },
  {
    title: "Aba Pré-Carga",
    items: [
      { key: "pre_header", label: "Alterar Dados Cabeçalho" },
      { key: "pre_itens", label: "Incluir/Retirar Itens" },
      { key: "pre_quantidade", label: "Alterar Quantidade" },
      { key: "pre_frete_seguro", label: "Alterar Frete/Seguro" },
    ],
  },
  { title: "Aba Descarga", items: [] },
  { title: "Aba Devolução", items: [] },
];

function IconButton({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-gray-300 bg-white text-gray-700 shadow-sm hover:bg-gray-50 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

export default function ProcessEditor({ processId }: { processId?: number }) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [id, setId] = useState<number | null>(processId ?? null);
  const [code, setCode] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [isActive, setIsActive] = useState<boolean>(true);

  const [phases, setPhases] = useState<Phase[]>([]);
  const [selectedPhaseId, setSelectedPhaseId] = useState<number | null>(null);

  const selectedPhase = useMemo(() => phases.find((p) => p.id === selectedPhaseId) || null, [phases, selectedPhaseId]);

  const load = async (pid: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/logistics/processes/${pid}`, { cache: "no-store" });
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
      const payload = {
        code: Number(code),
        description: description.trim(),
        isActive,
      };

      if (!payload.code || Number.isNaN(payload.code)) throw new Error("Cód Processo inválido");
      if (!payload.description) throw new Error("Descrição é obrigatória");

      if (id) {
        const res = await fetch(`/api/logistics/processes/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => null as any);
        if (!res.ok) throw new Error(data?.error || "Falha ao salvar");
        await load(id);
      } else {
        const res = await fetch("/api/logistics/processes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => null as any);
        if (!res.ok) throw new Error(data?.error || "Falha ao criar");
        const newId = Number(data?.id);
        if (Number.isFinite(newId) && newId > 0) {
          router.replace(`/logistics/processes/${newId}`);
        } else throw new Error("Falha ao obter ID do processo criado");
      }
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const removeProcess = async () => {
    if (!id) return;
    if (!confirm("Confirma excluir este processo logístico?")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/logistics/processes/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null as any);
      if (!res.ok) throw new Error(data?.error || "Falha ao excluir");
      router.push("/logistics/processes");
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const [phaseModalOpen, setPhaseModalOpen] = useState(false);
  const [phaseEditingId, setPhaseEditingId] = useState<number | null>(null);
  const [phaseCode, setPhaseCode] = useState<string>("");
  const [phaseDesc, setPhaseDesc] = useState<string>("");
  const [phaseAuto, setPhaseAuto] = useState<boolean>(false);
  const [phaseCarga, setPhaseCarga] = useState<boolean>(false);
  const [phaseDescarga, setPhaseDescarga] = useState<boolean>(false);
  const openPhaseModal = (p?: Phase) => {
    setPhaseEditingId(p?.id ?? null);
    setPhaseCode(p ? String(p.code ?? "") : "");
    setPhaseDesc(p ? String(p.description ?? "") : "");
    setPhaseAuto(Boolean(p?.isAuto));
    setPhaseCarga(Boolean(p?.isCarga));
    setPhaseDescarga(Boolean(p?.isDescarga));
    setPhaseModalOpen(true);
  };
  const savePhase = async () => {
    if (!id) return;
    const payload = {
      code: Number(phaseCode),
      description: phaseDesc.trim(),
      isAuto: phaseAuto,
      isCarga: phaseCarga,
      isDescarga: phaseDescarga,
    };
    if (!payload.code || Number.isNaN(payload.code)) return alert("Cód Fase inválido");
    if (!payload.description) return alert("Descrição da fase é obrigatória");
    if (!payload.isCarga && !payload.isDescarga) return alert('Marque "Carga" e/ou "Descarga".');
    try {
      setSaving(true);
      let res: Response;
      if (phaseEditingId) {
        res = await fetch(`/api/logistics/phases/${phaseEditingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/logistics/processes/${id}/phases`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
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
  const removePhase = async (pid: number) => {
    if (!id) return;
    if (!confirm("Confirma excluir esta fase?")) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/logistics/phases/${pid}`, { method: "DELETE" });
      const data = await res.json().catch(() => null as any);
      if (!res.ok) throw new Error(data?.error || "Falha ao excluir fase");
      await load(id);
    } catch (e: any) {
      alert(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const reorderPhases = async (orderedIds: number[]) => {
    if (!id) return;
    const res = await fetch(`/api/logistics/processes/${id}/phases/reorder`, {
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

  const [usersCache, setUsersCache] = useState<UserItem[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const ensureUsersLoaded = async () => {
    if (usersCache.length > 0) return;
    setUsersLoading(true);
    try {
      const res = await fetch("/api/users", { cache: "no-store" });
      const data = await res.json().catch(() => null as any);
      if (!res.ok) throw new Error(data?.error || "Falha ao carregar usuários");
      const arr = Array.isArray(data) ? data : [];
      setUsersCache(
        arr
          .map((u: any) => ({ id: Number(u.id), name: String(u.name || ""), abbrevName: u.abbrevName == null ? null : String(u.abbrevName) }))
          .filter((u: any) => Number.isFinite(u.id) && u.id > 0)
      );
    } catch (e: any) {
      alert(String(e?.message || e));
    } finally {
      setUsersLoading(false);
    }
  };

  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingNotifiedId, setEditingNotifiedId] = useState<number | null>(null);
  const [userQuery, setUserQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [allowReturn, setAllowReturn] = useState(false);
  const [allowNext, setAllowNext] = useState(false);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});

  const selectedUser = useMemo(() => usersCache.find((u) => u.id === selectedUserId) || null, [usersCache, selectedUserId]);

  const userSuggestions = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return [];
    return usersCache
      .filter((u) => String(u.abbrevName || "").toLowerCase().includes(q))
      .slice(0, 10);
  }, [usersCache, userQuery]);

  const openUserModal = async (nu?: NotifiedUser) => {
    if (!selectedPhase) return;
    await ensureUsersLoaded();
    setEditingNotifiedId(nu?.id ?? null);
    setSelectedUserId(nu?.userId ?? null);
    setUserQuery(nu?.user?.abbrevName ? String(nu.user.abbrevName) : "");
    setAllowReturn(Boolean(nu?.allowReturn));
    setAllowNext(Boolean(nu?.allowNext));
    const p = nu?.permissions && typeof nu.permissions === "object" ? nu.permissions : {};
    setPermissions({ ...(p as any) });
    setUserModalOpen(true);
  };

  const togglePerm = (key: string) => {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const saveNotifiedUser = async () => {
    if (!id || !selectedPhase) return;
    if (!selectedUserId) return alert("Selecione um usuário");
    const payload = {
      userId: selectedUserId,
      allowReturn,
      allowNext,
      permissions,
    };
    try {
      setSaving(true);
      let res: Response;
      if (editingNotifiedId) {
        res = await fetch(`/api/logistics/notified-users/${editingNotifiedId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/logistics/phases/${selectedPhase.id}/notified-users`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      const data = await res.json().catch(() => null as any);
      if (!res.ok) throw new Error(data?.error || "Falha ao salvar usuário notificado");
      setUserModalOpen(false);
      await load(id);
    } catch (e: any) {
      alert(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const removeNotifiedUser = async (nid: number) => {
    if (!id) return;
    if (!confirm("Confirma excluir este usuário notificado?")) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/logistics/notified-users/${nid}`, { method: "DELETE" });
      const data = await res.json().catch(() => null as any);
      if (!res.ok) throw new Error(data?.error || "Falha ao excluir");
      await load(id);
    } catch (e: any) {
      alert(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const headerTitle = id ? `Manutenção de Processo Logístico` : "Novo Processo Logístico";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">{headerTitle}</h1>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => router.push("/logistics/processes")} className="px-3 py-1.5 text-xs border rounded bg-white hover:bg-gray-100">
            Voltar
          </button>
          {id && (
            <button type="button" onClick={removeProcess} className="px-3 py-1.5 text-xs border rounded bg-white text-red-600 border-red-300 hover:bg-red-50">
              Excluir
            </button>
          )}
          <button
            type="button"
            onClick={saveProcess}
            disabled={saving}
            className="px-3 py-1.5 text-xs border rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Salvar
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}
      {loading && <div className="text-sm text-gray-500">Carregando...</div>}

      <div className="bg-white rounded border border-gray-200 p-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-gray-600">Cód Processo</label>
            <input className="w-full mt-1 px-2 py-1.5 border rounded" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div className="md:col-span-8">
            <label className="text-xs text-gray-600">Descrição</label>
            <input className="w-full mt-1 px-2 py-1.5 border rounded" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="md:col-span-2 flex items-end">
            <label className="inline-flex items-center gap-2 mt-2 text-sm">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Ativo?
            </label>
          </div>
        </div>
      </div>

      <div className="bg-white rounded border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
          <div className="font-medium">Fases do Processo</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openPhaseModal()}
              disabled={!id}
              className="px-3 py-1.5 text-xs border rounded bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Incluir
            </button>
          </div>
        </div>
        {!id ? (
          <div className="px-3 py-4 text-sm text-gray-600">Salve o processo para cadastrar as fases.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 text-gray-700">
                <tr>
                  <th className="text-left px-3 py-2 w-24">Cód</th>
                  <th className="text-left px-3 py-2">Descrição Fase</th>
                  <th className="text-left px-3 py-2 w-28">Fase Auto?</th>
                  <th className="text-center px-3 py-2 w-36">Sequência</th>
                  <th className="text-center px-3 py-2 w-40">Ações</th>
                </tr>
              </thead>
              <tbody>
                {phases.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center text-gray-500">
                      Sem fases cadastradas.
                    </td>
                  </tr>
                )}
                {phases.map((p, idx) => {
                  const active = selectedPhaseId === p.id;
                  return (
                    <tr
                      key={p.id}
                      className={`border-t hover:bg-gray-50 ${active ? "bg-blue-50" : ""}`}
                      onClick={() => setSelectedPhaseId(p.id)}
                    >
                      <td className="px-3 py-2 font-mono text-xs">{p.code}</td>
                      <td className="px-3 py-2">{p.description}</td>
                      <td className="px-3 py-2">{p.isAuto ? "Sim" : "Não"}</td>
                      <td className="px-3 py-2 text-center">
                        <div className="inline-flex gap-2">
                          <IconButton
                            title="Subir"
                            disabled={saving || idx === 0}
                            onClick={() => movePhase(p.id, -1)}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4 text-blue-600">
                              <path d="M12 5l-7 7h14Z" strokeWidth="2" strokeLinejoin="round" />
                            </svg>
                          </IconButton>
                          <IconButton
                            title="Descer"
                            disabled={saving || idx === phases.length - 1}
                            onClick={() => movePhase(p.id, 1)}
                          >
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
          <div className="font-medium">Usuários Notificados na Fase</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openUserModal()}
              disabled={!id || !selectedPhase}
              className="px-3 py-1.5 text-xs border rounded bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Incluir
            </button>
          </div>
        </div>
        {!id ? (
          <div className="px-3 py-4 text-sm text-gray-600">Salve o processo e selecione uma fase para vincular usuários.</div>
        ) : !selectedPhase ? (
          <div className="px-3 py-4 text-sm text-gray-600">Selecione uma fase para ver os usuários notificados.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 text-gray-700">
                <tr>
                  <th className="text-left px-3 py-2 w-32">Cód Usuário</th>
                  <th className="text-left px-3 py-2">Nome</th>
                  <th className="text-left px-3 py-2 w-36">Permite Retornar?</th>
                  <th className="text-left px-3 py-2 w-34">Permite Próxima?</th>
                  <th className="text-center px-3 py-2 w-40">Ações</th>
                </tr>
              </thead>
              <tbody>
                {(selectedPhase.notifiedUsers || []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center text-gray-500">
                      Sem usuários vinculados.
                    </td>
                  </tr>
                )}
                {(selectedPhase.notifiedUsers || []).map((nu) => (
                  <tr key={nu.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">{nu.user?.id ?? nu.userId}</td>
                    <td className="px-3 py-2">
                      <div className="text-sm">{nu.user?.name || "-"}</div>
                      <div className="text-xs text-gray-600">{nu.user?.abbrevName || "-"}</div>
                    </td>
                    <td className="px-3 py-2">{nu.allowReturn ? "Sim" : "Não"}</td>
                    <td className="px-3 py-2">{nu.allowNext ? "Sim" : "Não"}</td>
                    <td className="px-3 py-2 text-center">
                      <div className="inline-flex gap-2">
                        <IconButton title="Modificar" disabled={saving} onClick={() => openUserModal(nu)}>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
                            <path d="M12 20h9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </IconButton>
                        <IconButton title="Eliminar" disabled={saving} onClick={() => removeNotifiedUser(nu.id)}>
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
                <div className="col-span-12">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={phaseAuto} onChange={(e) => setPhaseAuto(e.target.checked)} />
                    Fase Auto?
                  </label>
                </div>
                <div className="col-span-12">
                  <div className="flex flex-wrap gap-6">
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={phaseCarga} onChange={(e) => setPhaseCarga(e.target.checked)} />
                      Carga
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={phaseDescarga} onChange={(e) => setPhaseDescarga(e.target.checked)} />
                      Descarga
                    </label>
                  </div>
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
              <div className="font-semibold">{editingNotifiedId ? "Modificar Usuário na Fase" : "Incluir Usuário na Fase"}</div>
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
                  <input className="w-full mt-1 px-2 py-1.5 border rounded bg-gray-50" value={selectedPhase.code} readOnly />
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {PERMISSION_GROUPS.map((g) => (
                  <div key={g.title} className="border rounded p-3">
                    <div className="font-medium mb-2">{g.title}</div>
                    {g.items.length === 0 ? (
                      <div className="text-sm text-gray-500">Sem permissões</div>
                    ) : (
                      <div className="space-y-1">
                        {g.items.map((it) => (
                          <label key={it.key} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={!!permissions[it.key]} onChange={() => togglePerm(it.key)} />
                            <span>{it.label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="px-4 py-3 border-t text-right space-x-2">
              <button className="px-3 py-1.5 border rounded hover:bg-gray-100" onClick={() => setUserModalOpen(false)}>
                Cancelar
              </button>
              <button className="px-3 py-1.5 border rounded bg-blue-600 text-white hover:bg-blue-700" onClick={saveNotifiedUser}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
