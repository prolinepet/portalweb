"use client";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';

type EntityEntry = {
  id: number;
  name: string;
};

type UserEntry = { id: number; name: string; salesRepAdmin?: boolean };

type MultiOpt = { value: string; label: string };

type Metric = {
  metaPrevista: number;
  carregado: number;
  devolucao: number;
  realizadoLiq: number;
  atingimento: number;
  emCarteira: number;
};

type GroupRow = { key: string; label: string; peso: Metric; valor: Metric };

type DashboardData = {
  year: number;
  month: string;
  entityId: number | null;
  summary: { peso: Metric; valor: Metric };
  groups: { FAMILY: GroupRow[]; CUSTOMER: GroupRow[]; REP: GroupRow[]; REGION: GroupRow[] };
};

function GroupGrid({
  firstColLabel,
  rows,
  fmtInt,
  fmtDec,
  metricType,
}: {
  firstColLabel: string;
  rows: GroupRow[];
  fmtInt: (v: number) => string;
  fmtDec: (v: number) => string;
  metricType: 'peso' | 'valor';
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm border border-gray-200 bg-white">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="p-1 border-b border-b-gray-200 border-r border-r-gray-100 font-medium">{firstColLabel}</th>
            <th className="p-1 border-b border-b-gray-200 border-r border-r-gray-100 font-medium text-right">Meta Prevista</th>
            <th className="p-1 border-b border-b-gray-200 border-r border-r-gray-100 font-medium text-right">Carregado</th>
            <th className="p-1 border-b border-b-gray-200 border-r border-r-gray-100 font-medium text-right">Devolução</th>
            <th className="p-1 border-b border-b-gray-200 border-r border-r-gray-100 font-medium text-right">Realizado Líq</th>
            <th className="p-1 border-b border-b-gray-200 border-r border-r-gray-100 font-medium text-right">(%)Atingimento</th>
            <th className="p-1 border-b font-medium text-right">Em Carteira</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="p-2 text-center text-gray-500" colSpan={7}>
                Sem dados
              </td>
            </tr>
          ) : (
            rows.map((r) => {
              const m = metricType === 'peso' ? r.peso : r.valor;
              return (
                <tr key={r.key} className="border-t">
                  <td className="p-1 border-r border-r-gray-100">{r.label}</td>
                  <td className="p-1 text-right border-r border-r-gray-100">{fmtInt(m.metaPrevista)}</td>
                  <td className="p-1 text-right border-r border-r-gray-100">{fmtInt(m.carregado)}</td>
                  <td className="p-1 text-right border-r border-r-gray-100">{fmtInt(m.devolucao)}</td>
                  <td className="p-1 text-right border-r border-r-gray-100">{fmtInt(m.realizadoLiq)}</td>
                  <td className="p-1 text-right border-r border-r-gray-100">{fmtDec(m.atingimento)}</td>
                  <td className="p-1 text-right">{fmtInt(m.emCarteira)}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function MultiSelectDropdown({
  label,
  placeholder,
  options,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  options: MultiOpt[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedLabels = useMemo(() => {
    const map = new Map(options.map((o) => [o.value, o.label]));
    return value.map((v) => map.get(v)).filter(Boolean) as string[];
  }, [options, value]);

  const allChecked = options.length > 0 && value.length === options.length;

  return (
    <div className="relative" ref={wrapperRef}>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <button
        type="button"
        className="border rounded px-3 py-1.5 text-sm w-full text-left focus:ring-2 focus:ring-blue-500 outline-none bg-white"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {selectedLabels.length ? `${selectedLabels.length} selecionado(s)` : placeholder}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-auto border rounded bg-white shadow">
          <label className="flex items-center gap-2 px-3 py-2 text-sm border-b cursor-pointer">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={(e) => onChange(e.target.checked ? options.map((o) => o.value) : [])}
            />
            <span>Selecionar todas as opções</span>
          </label>
          {options.map((o) => (
            <label key={o.value} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={value.includes(o.value)}
                onChange={(e) => {
                  onChange(
                    e.target.checked
                      ? (value.includes(o.value) ? value : [...value, o.value])
                      : value.filter((v) => v !== o.value)
                  );
                }}
              />
              <span>{o.label}</span>
            </label>
          ))}
          {options.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-500">Nenhuma opção disponível</div>
          )}
          <div className="flex items-center justify-between px-3 py-2 border-t text-xs">
            <button type="button" className="text-blue-600 hover:underline" onClick={() => onChange([])}>Limpar</button>
            <button type="button" className="text-gray-700 hover:underline" onClick={() => setOpen(false)}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SalesDashboard() {
  const { data: session } = useSession();
  const sessionUserId = (session?.user as any)?.id != null ? Number((session?.user as any)?.id) : null;
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState<string>('');
  const [entityId, setEntityId] = useState<string>('');
  const [entities, setEntities] = useState<EntityEntry[]>([]);
  const [repOptions, setRepOptions] = useState<MultiOpt[]>([]);
  const [selectedReps, setSelectedReps] = useState<string[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [isSalesAdmin, setIsSalesAdmin] = useState(false);
  const [activeGroupTab, setActiveGroupTab] = useState<'FAMILY' | 'CUSTOMER' | 'REP' | 'REGION'>('FAMILY');
  const [data, setData] = useState<DashboardData | null>(null);

  const months = [
    { value: '1', label: 'Janeiro' },
    { value: '2', label: 'Fevereiro' },
    { value: '3', label: 'Março' },
    { value: '4', label: 'Abril' },
    { value: '5', label: 'Maio' },
    { value: '6', label: 'Junho' },
    { value: '7', label: 'Julho' },
    { value: '8', label: 'Agosto' },
    { value: '9', label: 'Setembro' },
    { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' },
    { value: '12', label: 'Dezembro' },
  ];

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  useEffect(() => {
    const loadFilters = async () => {
      setLoading(true);
      try {
        const [permsRes, usersRes] = await Promise.all([
          fetch('/api/permissions', { cache: 'no-store' }).catch(() => null as any),
          fetch('/api/users', { cache: 'no-store' }).catch(() => null as any),
        ]);

        if (permsRes?.ok) {
          const j = await permsRes.json().catch(() => ({} as any));
          const list = Array.isArray(j?.entities) ? j.entities : [];
          setEntities(
            list
              .map((e: any) => ({ id: Number(e?.id), name: String(e?.name || '') }))
              .filter((e: any) => Number.isFinite(e.id) && e.id > 0 && e.name)
          );
        }

        if (usersRes?.ok) {
          const arr = await usersRes.json().catch(() => []);
          const list = Array.isArray(arr) ? (arr as UserEntry[]) : [];
          const me = sessionUserId ? list.find((u: any) => Number(u?.id) === Number(sessionUserId)) : null;
          const salesAdminFlag = Boolean((me as any)?.isSalesAdmin);
          setIsSalesAdmin(salesAdminFlag);
          if (!salesAdminFlag && me?.id) {
            setRepOptions([{ value: String(me.id), label: String(me.name || '') }]);
            setSelectedReps([String(me.id)]);
            return;
          }
          const reps = list.filter((u: any) => Boolean(u?.salesRepAdmin));
          const finalList = reps.length ? reps : list;
          setRepOptions(
            finalList
              .map((u: any) => ({ value: String(u.id), label: String(u.name || '') }))
              .filter((o: any) => o.value && o.label)
          );
        }
      } finally {
        setLoading(false);
      }
    };

    loadFilters();
  }, [sessionUserId]);

  const regionOptions: MultiOpt[] = useMemo(() => {
    return [
      { value: 'NORTE', label: 'Norte' },
      { value: 'NORDESTE', label: 'Nordeste' },
      { value: 'CENTRO_OESTE', label: 'Centro-Oeste' },
      { value: 'SUDESTE', label: 'Sudeste' },
      { value: 'SUL', label: 'Sul' },
    ];
  }, []);

  const fmtInt = (v: number) => v.toLocaleString('pt-BR');
  const fmtDec = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  useEffect(() => {
    const load = async () => {
      setDataLoading(true);
      setDataError(null);
      try {
        const params = new URLSearchParams();
        params.set('year', String(year));
        if (month) params.set('month', month);
        if (entityId) params.set('entityId', entityId);

        const res = await fetch(`/api/sales/dashboard/vendas?${params.toString()}`, { cache: 'no-store' });
        if (!res.ok) {
          const j = await res.json().catch(() => null as any);
          throw new Error(String(j?.error || `Falha ao carregar (HTTP ${res.status})`));
        }
        const j = (await res.json().catch(() => null)) as DashboardData | null;
        setData(j);
      } catch (e: any) {
        setData(null);
        setDataError(String(e?.message || e));
      } finally {
        setDataLoading(false);
      }
    };

    load();
  }, [year, month, entityId]);

  const summary =
    data?.summary ?? {
      peso: { metaPrevista: 0, carregado: 0, devolucao: 0, realizadoLiq: 0, atingimento: 0, emCarteira: 0 },
      valor: { metaPrevista: 0, carregado: 0, devolucao: 0, realizadoLiq: 0, atingimento: 0, emCarteira: 0 },
    };

  const currentRows = useMemo(() => {
    const g = data?.groups;
    if (!g) return [];
    const rows = g[activeGroupTab] || [];
    if (activeGroupTab === 'REGION' && selectedRegions.length > 0) {
      const set = new Set(selectedRegions);
      return rows.filter((r) => set.has(String(r.key || '').toUpperCase()));
    }
    return rows;
  }, [data, activeGroupTab, selectedRegions]);

  return (
    <div className="space-y-3 animate-in fade-in duration-500">
      <div className="bg-white p-2 rounded shadow-sm border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2 items-end">
          <div className="min-w-0">
            <label className="block text-xs font-medium text-gray-700 mb-1">Ano</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="border rounded px-3 py-1.5 text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none"
            >
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div className="min-w-0">
            <label className="block text-xs font-medium text-gray-700 mb-1">Mês</label>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">Todos</option>
              {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          <div className="min-w-0">
            <label className="block text-xs font-medium text-gray-700 mb-1">Entidade</label>
            <select
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">Todas</option>
              {entities.map((e) => (
                <option key={e.id} value={String(e.id)}>{e.name}</option>
              ))}
            </select>
          </div>

          {isSalesAdmin ? (
            <MultiSelectDropdown
              label="Representante"
              placeholder={loading ? "Carregando..." : "Selecione..."}
              options={repOptions}
              value={selectedReps}
              onChange={setSelectedReps}
            />
          ) : (
            <div className="min-w-0">
              <label className="block text-xs font-medium text-gray-700 mb-1">Representante</label>
              <input
                value={repOptions?.[0]?.label || ''}
                disabled
                className="border rounded px-3 py-1.5 text-sm w-full bg-gray-50 text-gray-700"
              />
            </div>
          )}

          <MultiSelectDropdown
            label="Região"
            placeholder="Selecione..."
            options={regionOptions}
            value={selectedRegions}
            onChange={setSelectedRegions}
          />
        </div>
      </div>

      <div className="bg-white p-2 rounded shadow-sm border border-gray-200">
        {dataError && <div className="text-sm text-red-600 mb-2">{dataError}</div>}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="p-1 border-b font-medium">Tipo Agrupa</th>
                <th className="p-1 border-b font-medium text-right">Meta Prevista</th>
                <th className="p-1 border-b font-medium text-right">Carregado</th>
                <th className="p-1 border-b font-medium text-right">Devolução</th>
                <th className="p-1 border-b font-medium text-right">Realizado Líq</th>
                <th className="p-1 border-b font-medium text-right">(%)Atingimento</th>
                <th className="p-1 border-b font-medium text-right">Em Carteira</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-1 border-b">Peso (KG)</td>
                <td className="p-1 border-b text-right">{fmtInt(summary.peso.metaPrevista)}</td>
                <td className="p-1 border-b text-right">{fmtInt(summary.peso.carregado)}</td>
                <td className="p-1 border-b text-right">{fmtInt(summary.peso.devolucao)}</td>
                <td className="p-1 border-b text-right">{fmtInt(summary.peso.realizadoLiq)}</td>
                <td className="p-1 border-b text-right">{fmtDec(summary.peso.atingimento)}</td>
                <td className="p-1 border-b text-right">{fmtInt(summary.peso.emCarteira)}</td>
              </tr>
              <tr>
                <td className="p-1">Valor</td>
                <td className="p-1 text-right">{fmtInt(summary.valor.metaPrevista)}</td>
                <td className="p-1 text-right">{fmtInt(summary.valor.carregado)}</td>
                <td className="p-1 text-right">{fmtInt(summary.valor.devolucao)}</td>
                <td className="p-1 text-right">{fmtInt(summary.valor.realizadoLiq)}</td>
                <td className="p-1 text-right">{fmtDec(summary.valor.atingimento)}</td>
                <td className="p-1 text-right">{fmtInt(summary.valor.emCarteira)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-2">
          {dataLoading && <div className="text-xs text-gray-500 mb-2">Carregando dados...</div>}
          <div className="flex flex-wrap gap-3 border-b">
            <button
              type="button"
              onClick={() => setActiveGroupTab('FAMILY')}
              className={`px-1 pb-1 text-sm ${activeGroupTab === 'FAMILY' ? 'text-blue-600 border-b-2 border-solid border-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Por Família
            </button>
            <button
              type="button"
              onClick={() => setActiveGroupTab('CUSTOMER')}
              className={`px-1 pb-1 text-sm ${activeGroupTab === 'CUSTOMER' ? 'text-blue-600 border-b-2 border-solid border-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Por Cliente
            </button>
            <button
              type="button"
              onClick={() => setActiveGroupTab('REP')}
              className={`px-1 pb-1 text-sm ${activeGroupTab === 'REP' ? 'text-blue-600 border-b-2 border-solid border-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Por Representante
            </button>
            <button
              type="button"
              onClick={() => setActiveGroupTab('REGION')}
              className={`px-1 pb-1 text-sm ${activeGroupTab === 'REGION' ? 'text-blue-600 border-b-2 border-solid border-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Por Região
            </button>
          </div>

          <div className="mt-2">
            {activeGroupTab === 'FAMILY' && (
              <GroupGrid firstColLabel="Descrição Família" rows={currentRows} fmtInt={fmtInt} fmtDec={fmtDec} metricType="valor" />
            )}
            {activeGroupTab === 'CUSTOMER' && (
              <GroupGrid firstColLabel="Descrição Cliente" rows={currentRows} fmtInt={fmtInt} fmtDec={fmtDec} metricType="valor" />
            )}
            {activeGroupTab === 'REP' && (
              <GroupGrid firstColLabel="Descrição Representante" rows={currentRows} fmtInt={fmtInt} fmtDec={fmtDec} metricType="valor" />
            )}
            {activeGroupTab === 'REGION' && (
              <GroupGrid firstColLabel="Descrição Região" rows={currentRows} fmtInt={fmtInt} fmtDec={fmtDec} metricType="valor" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
