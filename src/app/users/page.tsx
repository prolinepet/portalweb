"use client";
// Rebuild trigger: Fix webpack runtime error
import { useCallback, useEffect, useMemo, useState } from "react";

type EntityItem = { id: number; name: string; cnpj: string; linked: number | boolean };
type ModuleItem = { id: number; code: string; name: string; userLinked: number | boolean };
type ProgramItem = { id: number; code: string; name: string; allowed: number | boolean };

type MainTabKey = "listagem" | "manutencao";
type MaintenanceTabKey = "geral" | "configuracoes" | "permissoes" | "meu-financeiro";

const PAGE_SIZE = 10;

const MAIN_TABS: Array<{ key: MainTabKey; label: string }> = [
  { key: "listagem", label: "Listagem" },
  { key: "manutencao", label: "Manutenção" },
];

const MAINTENANCE_TABS: Array<{ key: MaintenanceTabKey; label: string }> = [
  { key: "geral", label: "Geral" },
  { key: "configuracoes", label: "Configurações" },
  { key: "permissoes", label: "Permissões" },
  { key: "meu-financeiro", label: "Meu Financeiro" },
];

function formatDoc(doc?: string): string {
  const d = String(doc || "").replace(/\D+/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
  return doc || "";
}

function buildPageNumbers(currentPage: number, totalPages: number) {
  if (totalPages <= 1) return [1];

  const pages = new Set<number>([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  return [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
}

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    abbrevName: "",
    email: "",
    password: "",
    doc: "",
    costCenter: "",
    pixKey: "",
  });
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState<boolean>(false);

  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [entities, setEntities] = useState<EntityItem[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<number | null>(null);
  const [programs, setPrograms] = useState<ProgramItem[]>([]);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [activeMainTab, setActiveMainTab] = useState<MainTabKey>("listagem");
  const [activeMaintenanceTab, setActiveMaintenanceTab] = useState<MaintenanceTabKey>("geral");
  const [currentPage, setCurrentPage] = useState(1);

  const selectedUser = useMemo(() => users.find((u) => u.id === selectedUserId) || null, [users, selectedUserId]);
  const selectedEntity = useMemo(() => entities.find((e) => e.id === selectedEntityId) || null, [entities, selectedEntityId]);
  const selectedModule = useMemo(() => modules.find((m) => m.id === selectedModuleId) || null, [modules, selectedModuleId]);

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    const qDigits = q.replace(/\D+/g, "");
    if (!q) return users;
    return users.filter((u) => {
      const name = (u.name || "").toLowerCase();
      const email = (u.email || "").toLowerCase();
      const docStr = String(u?.doc || "");
      const docDigits = docStr.replace(/\D+/g, "");
      return name.includes(q) || email.includes(q) || (qDigits ? docDigits.includes(qDigits) : docStr.toLowerCase().includes(q));
    });
  }, [users, userQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const currentPageSafe = Math.min(currentPage, totalPages);
  const pageStart = (currentPageSafe - 1) * PAGE_SIZE;
  const paginatedUsers = useMemo(
    () => filteredUsers.slice(pageStart, pageStart + PAGE_SIZE),
    [filteredUsers, pageStart]
  );
  const visiblePageNumbers = useMemo(() => buildPageNumbers(currentPageSafe, totalPages), [currentPageSafe, totalPages]);
  const allVisibleSelected = useMemo(
    () => paginatedUsers.length > 0 && paginatedUsers.every((u: any) => selectedIds.includes(u.id)),
    [paginatedUsers, selectedIds]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [userQuery]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/users", { cache: "no-store" });
      const data = await res.json();
      const arr = Array.isArray(data) ? data : [];
      setUsers(arr);
      setSelectedUserId((prev) => prev ?? (arr.length ? arr[0].id : null));
      setSelectedIds((prev) => prev.filter((id) => arr.some((u: any) => u.id === id)));
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEntities = useCallback(async (uid: number) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/users/${uid}/entities`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      setEntities(data.entities || []);
      setSelectedEntityId((prev) => prev ?? (data.entities?.length ? data.entities[0].id : null));
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadModules = async (uid: number, eid: number) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/users/${uid}/entities/${eid}/modules`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      setModules(data.modules || []);
      setSelectedModuleId(null);
      setPrograms([]);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const loadPrograms = async (uid: number, eid: number, mid: number) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/users/${uid}/entities/${eid}/modules/${mid}/programs`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      setPrograms(data.programs || []);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (selectedUserId) loadEntities(selectedUserId);
  }, [selectedUserId, loadEntities]);

  useEffect(() => {
    if (selectedUserId && selectedEntityId) loadModules(selectedUserId, selectedEntityId);
  }, [selectedUserId, selectedEntityId]);

  useEffect(() => {
    if (selectedUserId && selectedEntityId && selectedModuleId) loadPrograms(selectedUserId, selectedEntityId, selectedModuleId);
  }, [selectedUserId, selectedEntityId, selectedModuleId]);

  const fillFormFromUser = (u: any) => {
    setForm({
      name: u?.name || "",
      abbrevName: u?.abbrevName || "",
      email: u?.email || "",
      password: "",
      doc: String(u?.doc || ""),
      costCenter: String(u?.costCenter || ""),
      pixKey: String(u?.pixKey || ""),
    });
  };

  const resetMaintenanceState = () => {
    setEditingUserId(null);
    setForm({
      name: "",
      abbrevName: "",
      email: "",
      password: "",
      doc: "",
      costCenter: "",
      pixKey: "",
    });
  };

  const openMaintenance = (tab: MaintenanceTabKey = "geral") => {
    setActiveMainTab("manutencao");
    setActiveMaintenanceTab(tab);
    setFormOpen(true);
  };

  const cancelEdit = () => {
    if (selectedUser) {
      setEditingUserId(selectedUser.id);
      fillFormFromUser(selectedUser);
      openMaintenance(activeMaintenanceTab);
      return;
    }
    resetMaintenanceState();
  };

  const openEditForm = (u: any) => {
    setSelectedUserId(u.id);
    setEditingUserId(u.id);
    fillFormFromUser(u);
    openMaintenance("geral");
  };

  const openAddForm = () => {
    resetMaintenanceState();
    setSelectedUserId(null);
    setEntities([]);
    setModules([]);
    setPrograms([]);
    setSelectedEntityId(null);
    setSelectedModuleId(null);
    openMaintenance("geral");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      if (editingUserId) {
        const res = await fetch(`/api/users`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingUserId, ...form }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
        setUsers((prev) => prev.map((user) => (user.id === data.id ? { ...user, ...data } : user)));
        await loadUsers();
        setSelectedUserId(data.id);
        setEditingUserId(data.id);
        fillFormFromUser(data);
      } else {
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
        setUsers((prev) => [...prev.filter((user) => user.id !== data.id), data]);
        await loadUsers();
        setSelectedUserId(data.id);
        setEditingUserId(data.id);
        fillFormFromUser(data);
      }
      openMaintenance("geral");
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const toggleSalesRepAdmin = async (checked: boolean) => {
    if (!selectedUserId) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/users`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedUserId, salesRepAdmin: checked }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      await loadUsers();
      setSelectedUserId(data.id);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const toggleSalesAdmin = async (checked: boolean) => {
    if (!selectedUserId) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/users`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedUserId, isSalesAdmin: checked }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      await loadUsers();
      setSelectedUserId(data.id);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const toggleTwoFactorRequired = async (checked: boolean) => {
    if (!selectedUserId) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/users`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedUserId, twoFactorRequired: checked }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      await loadUsers();
      setSelectedUserId(data.id);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const resetTwoFactor = async () => {
    if (!selectedUserId) return;
    if (!window.confirm("Deseja realmente resetar o 2FA deste usuário? O usuário precisará configurar novamente no próximo login.")) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/users/${selectedUserId}/reset-2fa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      await loadUsers();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const setErpMode = async (mode: string) => {
    if (!selectedUserId) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/users`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedUserId, erpIntegrationMode: mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      await loadUsers();
      setSelectedUserId(data.id);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const bulkDelete = async () => {
    const ids = selectedIds.filter((n) => Number.isFinite(n));
    if (ids.length === 0) return;
    const ok = typeof window !== "undefined" ? window.confirm(`Excluir ${ids.length} usuário(s) e remover vínculos?`) : true;
    if (!ok) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      setSelectedIds([]);
      resetMaintenanceState();
      await loadUsers();
      setSelectedUserId(null);
      setEntities([]);
      setModules([]);
      setPrograms([]);
      setSelectedEntityId(null);
      setSelectedModuleId(null);
      setFormOpen(false);
      setActiveMainTab("listagem");
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const toggleRow = (id: number, checked: boolean) => {
    setSelectedIds((prev) => (checked ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((n) => n !== id)));
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    if (checked) setSelectedIds(Array.from(new Set([...selectedIds, ...paginatedUsers.map((u: any) => u.id)])));
    else setSelectedIds((prev) => prev.filter((id) => !paginatedUsers.some((u: any) => u.id === id)));
  };

  const toggleEntityLink = async (eid: number, linked: boolean) => {
    if (!selectedUserId) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/users/${selectedUserId}/entities`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityId: eid, linked }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      await loadEntities(selectedUserId);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const toggleModuleLink = async (mid: number, linked: boolean) => {
    if (!selectedUserId || !selectedEntityId || !selectedEntity?.linked) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/users/${selectedUserId}/entities/${selectedEntityId}/modules`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId: mid, linked }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      await loadModules(selectedUserId, selectedEntityId);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const toggleProgramAllowed = async (pid: number, allowed: boolean) => {
    if (!selectedUserId || !selectedEntityId || !selectedModuleId || !selectedEntity?.linked || !selectedModule?.userLinked) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/users/${selectedUserId}/entities/${selectedEntityId}/modules/${selectedModuleId}/programs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: pid, allowed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      await loadPrograms(selectedUserId, selectedEntityId, selectedModuleId);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const linkAllModules = async () => {
    if (!selectedUserId || !selectedEntityId || !selectedEntity?.linked) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/users/${selectedUserId}/entities/${selectedEntityId}/modules`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "link_all" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      await loadModules(selectedUserId, selectedEntityId);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const unlinkAllModules = async () => {
    if (!selectedUserId || !selectedEntityId || !selectedEntity?.linked) return;
    const ok = typeof window !== "undefined" ? window.confirm("Desvincular todos os módulos deste usuário na entidade selecionada?") : true;
    if (!ok) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/users/${selectedUserId}/entities/${selectedEntityId}/modules`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unlink_all" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      await loadModules(selectedUserId, selectedEntityId);
      setSelectedModuleId(null);
      setPrograms([]);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const linkAllPrograms = async () => {
    if (!selectedUserId || !selectedEntityId || !selectedModuleId || !selectedEntity?.linked || !selectedModule?.userLinked) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/users/${selectedUserId}/entities/${selectedEntityId}/modules/${selectedModuleId}/programs`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "link_all" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      await loadPrograms(selectedUserId, selectedEntityId, selectedModuleId);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const unlinkAllPrograms = async () => {
    if (!selectedUserId || !selectedEntityId || !selectedModuleId || !selectedEntity?.linked || !selectedModule?.userLinked) return;
    const ok = typeof window !== "undefined" ? window.confirm("Desvincular todos os programas deste usuário para o módulo selecionado?") : true;
    if (!ok) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/users/${selectedUserId}/entities/${selectedEntityId}/modules/${selectedModuleId}/programs`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unlink_all" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      await loadPrograms(selectedUserId, selectedEntityId, selectedModuleId);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const renderMainTabButton = (tab: { key: MainTabKey; label: string }) => {
    const selected = activeMainTab === tab.key;
    return (
      <button
        key={tab.key}
        type="button"
        onClick={() => setActiveMainTab(tab.key)}
        className={`rounded-t-md border border-b-0 px-4 py-2 text-sm ${
          selected
            ? "border-gray-300 bg-white font-medium text-gray-900"
            : "border-transparent bg-gray-100 text-gray-600 hover:bg-gray-200"
        }`}
      >
        {tab.label}
      </button>
    );
  };

  const renderMaintenanceTabButton = (tab: { key: MaintenanceTabKey; label: string }) => {
    const selected = activeMaintenanceTab === tab.key;
    return (
      <button
        key={tab.key}
        type="button"
        onClick={() => setActiveMaintenanceTab(tab.key)}
        className={`rounded-t-md border border-b-0 px-4 py-2 text-sm ${
          selected
            ? "border-gray-300 bg-white font-medium text-gray-900"
            : "border-transparent bg-gray-100 text-gray-600 hover:bg-gray-200"
        }`}
      >
        {tab.label}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Administração • Usuários</h1>
      {err && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      <div className="rounded border bg-white shadow-sm">
        <div className="flex flex-wrap gap-2 border-b border-gray-200 px-4 pt-4">{MAIN_TABS.map(renderMainTabButton)}</div>

        <div className="rounded-b border-t-0 border-gray-200 bg-gray-50 p-4">
          {activeMainTab === "listagem" ? (
            <div className="space-y-3 rounded border bg-white p-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  placeholder="Buscar por nome, e-mail ou CPF/CNPJ"
                  className="min-w-[280px] flex-1 rounded border px-3 py-2 text-sm"
                />
                <button type="button" onClick={openAddForm} className="rounded bg-green-600 px-3 py-2 text-sm text-white">
                  Incluir usuário
                </button>
                <button
                  type="button"
                  onClick={bulkDelete}
                  disabled={selectedIds.length === 0}
                  className="rounded border border-red-300 px-3 py-2 text-sm text-red-700 disabled:opacity-50"
                >
                  Excluir selecionados
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
                <div>{selectedIds.length > 0 ? `${selectedIds.length} selecionado(s)` : "Nenhum usuário selecionado."}</div>
                <div>
                  Exibindo {filteredUsers.length === 0 ? 0 : pageStart + 1} a {Math.min(pageStart + PAGE_SIZE, filteredUsers.length)} de{" "}
                  {filteredUsers.length}
                </div>
              </div>

              <div className="overflow-hidden rounded border">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        <th className="w-10 p-2">
                          <input type="checkbox" checked={allVisibleSelected} onChange={(e) => toggleSelectAllVisible(e.target.checked)} />
                        </th>
                        <th className="p-2">Nome</th>
                        <th className="p-2">Nome Abrev</th>
                        <th className="p-2">CPF/CNPJ</th>
                        <th className="p-2">E-mail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedUsers.map((u: any) => (
                        <tr key={u.id} className="border-b hover:bg-gray-50">
                          <td className="p-2 text-center">
                            <input type="checkbox" checked={selectedIds.includes(u.id)} onChange={(e) => toggleRow(u.id, e.target.checked)} />
                          </td>
                          <td className="p-2">
                            <button
                              type="button"
                              className="w-full text-left text-blue-700 hover:underline"
                              onClick={() => openEditForm(u)}
                            >
                              {u.name}
                            </button>
                          </td>
                          <td className="p-2">{u.abbrevName || ""}</td>
                          <td className="p-2">{formatDoc(String(u.doc || ""))}</td>
                          <td className="p-2">{u.email}</td>
                        </tr>
                      ))}
                      {paginatedUsers.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-3 text-center text-gray-500">
                            Nenhum usuário encontrado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-gray-600">
                  Página {currentPageSafe} de {totalPages}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPageSafe <= 1}
                    className="rounded border px-3 py-1.5 text-xs disabled:opacity-50"
                  >
                    Primeira
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPageSafe <= 1}
                    className="rounded border px-3 py-1.5 text-xs disabled:opacity-50"
                  >
                    Anterior
                  </button>
                  {visiblePageNumbers.map((page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setCurrentPage(page)}
                      className={`rounded px-3 py-1.5 text-xs ${
                        page === currentPageSafe ? "bg-gray-800 text-white" : "border"
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPageSafe >= totalPages}
                    className="rounded border px-3 py-1.5 text-xs disabled:opacity-50"
                  >
                    Próxima
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPageSafe >= totalPages}
                    className="rounded border px-3 py-1.5 text-xs disabled:opacity-50"
                  >
                    Última
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded border bg-white">
                <div className="flex flex-wrap gap-2 border-b border-gray-200 px-4 pt-4">{MAINTENANCE_TABS.map(renderMaintenanceTabButton)}</div>

                {!formOpen ? (
                  <div className="p-6 text-sm text-gray-600">
                    Selecione um usuário na aba Listagem ou use o botão <span className="font-medium">Incluir usuário</span> para abrir a manutenção.
                  </div>
                ) : (
                  <div className="bg-gray-50 p-4">
                    {activeMaintenanceTab === "geral" && (
                      <div className="rounded border bg-white p-3">
                        <div className="mb-3 flex items-center justify-between">
                          <div className="font-semibold">Geral</div>
                          {selectedUser && (
                            <div className="text-xs text-gray-500">
                              {editingUserId ? `Editando usuário #${selectedUser.id}` : "Novo usuário"}
                            </div>
                          )}
                        </div>
                        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                          <input
                            className="rounded border px-3 py-2"
                            placeholder="Nome"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            required
                          />
                          <input
                            className="rounded border px-3 py-2"
                            placeholder="Nome Abrev"
                            value={form.abbrevName}
                            maxLength={20}
                            onChange={(e) => setForm({ ...form, abbrevName: e.target.value })}
                          />
                          <input
                            className="rounded border px-3 py-2"
                            placeholder="CPF/CNPJ"
                            value={form.doc}
                            onChange={(e) => setForm({ ...form, doc: e.target.value })}
                          />
                          <input
                            className="rounded border px-3 py-2"
                            type="email"
                            placeholder="E-mail"
                            value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                            required
                          />
                          <div className="md:col-span-2 xl:col-span-4">
                            <input
                              className="w-full rounded border px-3 py-2"
                              type="password"
                              placeholder={editingUserId ? "Nova senha (opcional)" : "Senha"}
                              value={form.password}
                              onChange={(e) => setForm({ ...form, password: e.target.value })}
                              required={!editingUserId}
                            />
                          </div>
                          <div className="md:col-span-2 xl:col-span-4 flex flex-wrap justify-end gap-2 pt-2">
                            <button className="rounded bg-gray-800 px-4 py-2 text-white">{editingUserId ? "Atualizar" : "Salvar"}</button>
                            {editingUserId && (
                              <button type="button" onClick={cancelEdit} className="rounded border px-4 py-2">
                                Cancelar
                              </button>
                            )}
                          </div>
                        </form>
                      </div>
                    )}

                    {activeMaintenanceTab === "configuracoes" && (
                      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <div className="rounded border bg-white p-3">
                          <div className="mb-2 font-medium">Tags</div>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              disabled={!selectedUser}
                              checked={Boolean(selectedUser?.salesRepAdmin)}
                              onChange={(ev) => toggleSalesRepAdmin(ev.target.checked)}
                            />
                            Representante
                          </label>
                          <label className="mt-2 flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              disabled={!selectedUser}
                              checked={Boolean(selectedUser?.isSalesAdmin)}
                              onChange={(ev) => toggleSalesAdmin(ev.target.checked)}
                            />
                            Adm Vendas
                          </label>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                disabled={!selectedUser}
                                checked={Boolean(selectedUser?.twoFactorRequired)}
                                onChange={(ev) => toggleTwoFactorRequired(ev.target.checked)}
                              />
                              2FA Obrigatório
                            </label>
                            {selectedUser?.hasTwoFactorSecret && (
                              <button
                                type="button"
                                onClick={resetTwoFactor}
                                className="rounded border border-red-200 bg-red-100 px-2 py-0.5 text-xs text-red-700 hover:bg-red-200"
                                title="Resetar 2FA do usuário"
                              >
                                Resetar 2FA
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="rounded border bg-white p-3">
                          <div className="mb-2 font-medium">Integração com ERP</div>
                          <div className="flex flex-wrap gap-4">
                            <label className="flex items-center gap-1 text-sm">
                              <input
                                type="radio"
                                name="erpMode"
                                disabled={!selectedUser}
                                checked={selectedUser?.erpIntegrationMode === "PROD"}
                                onChange={() => setErpMode("PROD")}
                              />
                              Produção
                            </label>
                            <label className="flex items-center gap-1 text-sm">
                              <input
                                type="radio"
                                name="erpMode"
                                disabled={!selectedUser}
                                checked={!selectedUser?.erpIntegrationMode || selectedUser?.erpIntegrationMode === "TEST"}
                                onChange={() => setErpMode("TEST")}
                              />
                              Teste
                            </label>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeMaintenanceTab === "permissoes" && (
                      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                        <div className="rounded border bg-white p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <h2 className="font-medium">Entidades {selectedUser ? `• ${selectedUser.name}` : ""}</h2>
                            {selectedUserId && (
                              <button type="button" onClick={() => loadEntities(selectedUserId)} className="rounded border px-2 py-1 text-xs">
                                Atualizar
                              </button>
                            )}
                          </div>
                          <div className="space-y-2">
                            {entities.map((e) => (
                              <div
                                key={e.id}
                                className={`flex items-center justify-between gap-2 rounded px-2 py-1 ${
                                  selectedEntityId === e.id ? "border border-blue-200 bg-blue-50" : "border"
                                }`}
                              >
                                <button type="button" onClick={() => setSelectedEntityId(e.id)} className="flex-1 text-left">
                                  <div className="text-sm font-medium">{e.name}</div>
                                  <div className="text-xs text-gray-500">{e.cnpj}</div>
                                </button>
                                <label className="flex items-center gap-1 text-xs">
                                  <input type="checkbox" checked={Boolean(e.linked)} onChange={(ev) => toggleEntityLink(e.id, ev.target.checked)} /> Vincular
                                </label>
                              </div>
                            ))}
                            {entities.length === 0 && (
                              <div className="text-sm text-gray-500">{selectedUserId ? "Nenhuma entidade cadastrada" : "Selecione um usuário"}</div>
                            )}
                          </div>
                        </div>

                        <div className="rounded border bg-white p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <h2 className="font-medium">Módulos {selectedEntity ? `• ${selectedEntity.name}` : ""}</h2>
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={linkAllModules} disabled={!selectedEntity?.linked} className="rounded border px-2 py-1 text-xs">
                                Vincular todos
                              </button>
                              <button type="button" onClick={unlinkAllModules} disabled={!selectedEntity?.linked} className="rounded border px-2 py-1 text-xs">
                                Desvincular todos
                              </button>
                            </div>
                          </div>
                          <div className="space-y-2">
                            {modules.map((m) => (
                              <div
                                key={m.id}
                                className={`flex items-center justify-between gap-2 rounded px-2 py-1 ${
                                  selectedModuleId === m.id ? "border border-blue-200 bg-blue-50" : "border"
                                }`}
                              >
                                <button type="button" onClick={() => setSelectedModuleId(m.id)} className="flex-1 text-left">
                                  <div className="text-sm font-medium">{m.name}</div>
                                  <div className="text-xs text-gray-500">{m.code}</div>
                                </button>
                                <label className="flex items-center gap-1 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(m.userLinked)}
                                    disabled={!selectedEntity || !Boolean(selectedEntity.linked)}
                                    onChange={(ev) => toggleModuleLink(m.id, ev.target.checked)}
                                  />
                                  Vincular
                                </label>
                              </div>
                            ))}
                            {modules.length === 0 && (
                              <div className="text-sm text-gray-500">{selectedEntityId ? "Nenhum módulo vinculado à entidade" : "Selecione uma entidade"}</div>
                            )}
                          </div>
                        </div>

                        <div className="rounded border bg-white p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <h2 className="font-medium">Programas {selectedModule ? `• ${selectedModule.name}` : ""}</h2>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={linkAllPrograms}
                                disabled={!selectedEntity?.linked || !selectedModule?.userLinked}
                                className="rounded border px-2 py-1 text-xs"
                              >
                                Vincular todos
                              </button>
                              <button
                                type="button"
                                onClick={unlinkAllPrograms}
                                disabled={!selectedEntity?.linked || !selectedModule?.userLinked}
                                className="rounded border px-2 py-1 text-xs"
                              >
                                Desvincular todos
                              </button>
                            </div>
                          </div>
                          <div className="space-y-2">
                            {programs.map((p) => (
                              <div key={p.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1">
                                <div>
                                  <div className="text-sm font-medium">{p.name}</div>
                                  <div className="text-xs text-gray-500">{p.code}</div>
                                </div>
                                <label className="flex items-center gap-1 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(p.allowed)}
                                    disabled={!selectedEntity?.linked || !selectedModule?.userLinked}
                                    onChange={(ev) => toggleProgramAllowed(p.id, ev.target.checked)}
                                  />
                                  Permitir
                                </label>
                              </div>
                            ))}
                            {programs.length === 0 && <div className="text-sm text-gray-500">Selecione um módulo</div>}
                          </div>
                        </div>
                      </div>
                    )}

                    {activeMaintenanceTab === "meu-financeiro" && (
                      <div className="rounded border bg-white p-3">
                        <div className="mb-3 font-medium">Meu Financeiro</div>
                        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-2 md:grid-cols-2">
                          <input
                            className="rounded border px-3 py-2"
                            placeholder="Centro Custo"
                            value={form.costCenter}
                            onChange={(e) => setForm({ ...form, costCenter: e.target.value })}
                          />
                          <input
                            className="rounded border px-3 py-2"
                            placeholder="Chave PIX"
                            value={form.pixKey}
                            onChange={(e) => setForm({ ...form, pixKey: e.target.value })}
                          />
                          <div className="md:col-span-2 flex flex-wrap justify-end gap-2 pt-2">
                            <button className="rounded bg-gray-800 px-4 py-2 text-white">{editingUserId ? "Atualizar" : "Salvar"}</button>
                            {editingUserId && (
                              <button type="button" onClick={cancelEdit} className="rounded border px-4 py-2">
                                Cancelar
                              </button>
                            )}
                          </div>
                        </form>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {loading && <div className="text-xs text-gray-500">Carregando...</div>}
    </div>
  );
}
