import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';

function toInt(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(String(v || '').trim());
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(String(v || '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function normalizeMonth(v: unknown): number {
  const n = toInt(v);
  if (!n) return 0;
  if (n < 1 || n > 12) return 0;
  return n;
}

type Metric = {
  metaPrevista: number;
  carregado: number;
  devolucao: number;
  realizadoLiq: number;
  atingimento: number;
  emCarteira: number;
};

type GroupRow = { key: string; label: string; peso: Metric; valor: Metric };

function computeMetric(metaPrevista: number, carregado: number, devolucao: number, emCarteira: number): Metric {
  const realizadoLiq = carregado - devolucao;
  const atingimento = metaPrevista > 0 ? (realizadoLiq / metaPrevista) * 100 : 0;
  return {
    metaPrevista,
    carregado,
    devolucao,
    realizadoLiq,
    atingimento,
    emCarteira,
  };
}

function readMetric(raw: any): Metric {
  const metaPrevista = num(raw?.metaPrevista);
  const carregado = num(raw?.carregado);
  const devolucao = num(raw?.devolucao);
  const emCarteira = num(raw?.emCarteira);
  return computeMetric(metaPrevista, carregado, devolucao, emCarteira);
}

function readGroupRows(arr: any): GroupRow[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((r: any) => {
      const key = String(r?.key || '').trim();
      const label = String(r?.label || '').trim();
      if (!key && !label) return null;
      const peso = readMetric(r?.peso);
      const valor = readMetric(r?.valor);
      return { key: key || label, label: label || key, peso, valor };
    })
    .filter(Boolean) as GroupRow[];
}

function mergeGroupRows(a: GroupRow[], b: GroupRow[]): GroupRow[] {
  const byKey = new Map<string, GroupRow>();
  const addRow = (row: GroupRow) => {
    const k = String(row.key || row.label);
    const cur = byKey.get(k);
    if (!cur) {
      byKey.set(k, {
        key: row.key,
        label: row.label,
        peso: { ...row.peso },
        valor: { ...row.valor },
      });
      return;
    }
    cur.peso = computeMetric(
      cur.peso.metaPrevista + row.peso.metaPrevista,
      cur.peso.carregado + row.peso.carregado,
      cur.peso.devolucao + row.peso.devolucao,
      cur.peso.emCarteira + row.peso.emCarteira
    );
    cur.valor = computeMetric(
      cur.valor.metaPrevista + row.valor.metaPrevista,
      cur.valor.carregado + row.valor.carregado,
      cur.valor.devolucao + row.valor.devolucao,
      cur.valor.emCarteira + row.valor.emCarteira
    );
    cur.label = cur.label || row.label;
  };
  for (const r of a) addRow(r);
  for (const r of b) addRow(r);
  return Array.from(byKey.values()).sort((x, y) => x.label.localeCompare(y.label, 'pt-BR'));
}

function normalizeKey(s: unknown): string {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function pickRepRow(rows: GroupRow[], candidates: string[]): GroupRow | null {
  if (!rows.length) return null;
  const cand = candidates.map(normalizeKey).filter(Boolean);
  if (!cand.length) return null;

  for (const c of cand) {
    const exact = rows.find((r) => normalizeKey(r.key) === c || normalizeKey(r.label) === c);
    if (exact) return exact;
  }

  for (const c of cand) {
    const partial = rows.find((r) => normalizeKey(r.key).includes(c) || normalizeKey(r.label).includes(c));
    if (partial) return partial;
  }

  return null;
}

function filterGroupRowsByRepPrefix(rows: GroupRow[], rep: GroupRow, candidates: string[]): GroupRow[] {
  const cand = new Set(candidates.map(normalizeKey).filter(Boolean));
  const repKeys = new Set<string>([normalizeKey(rep.key), normalizeKey(rep.label)].filter(Boolean));
  for (const x of repKeys) cand.add(x);

  const splitDelims = ['|', '::', ';', '-', '—', '–'];
  const trySplit = (rawKey: string): { repPart: string; rest: string } | null => {
    const k = String(rawKey || '').trim();
    if (!k) return null;
    for (const d of splitDelims) {
      const idx = k.indexOf(d);
      if (idx <= 0) continue;
      const left = k.slice(0, idx).trim();
      const right = k.slice(idx + d.length).trim();
      if (!left || !right) continue;
      return { repPart: left, rest: right };
    }
    return null;
  };

  const out: GroupRow[] = [];
  for (const r of rows) {
    const parts = trySplit(String(r.key || ''));
    if (!parts) continue;
    const leftNorm = normalizeKey(parts.repPart);
    if (!cand.has(leftNorm)) continue;
    out.push({
      key: parts.rest,
      label: String(r.label || parts.rest),
      peso: r.peso,
      valor: r.valor,
    });
  }
  return out.sort((x, y) => x.label.localeCompare(y.label, 'pt-BR'));
}

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user ? Number((session.user as any).id) : null;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const me = await prisma.user.findUnique({ where: { id: Math.trunc(userId) }, select: { isSalesAdmin: true, name: true, doc: true } }).catch(() => null);
    const isSalesAdmin = Boolean(me?.isSalesAdmin);
    const sessionEntityIdRaw = (session as any)?.entityId ?? (session as any)?.activeEntityId ?? null;
    const sessionEntityId = sessionEntityIdRaw != null ? toInt(sessionEntityIdRaw) : null;

    const url = new URL(request.url);
    const yearRaw = toInt(url.searchParams.get('year')) ?? new Date().getFullYear();
    const year = yearRaw >= 2000 && yearRaw <= 2100 ? yearRaw : new Date().getFullYear();
    const monthParam = normalizeMonth(url.searchParams.get('month'));
    const entityIdParam = toInt(url.searchParams.get('entityId'));

    const entities = await prisma.entity.findMany({
      where: { isActive: true, userEntities: { some: { userId } } },
      select: { id: true },
    });
    const allowedEntityIds = entities.map((e) => e.id);
    if (allowedEntityIds.length === 0 && sessionEntityId && Number.isFinite(sessionEntityId) && sessionEntityId > 0) {
      allowedEntityIds.push(sessionEntityId);
    }
    if (allowedEntityIds.length === 0) {
      return NextResponse.json({
        year,
        month: monthParam ? String(monthParam) : '',
        entityId: entityIdParam ?? null,
        summary: { peso: computeMetric(0, 0, 0, 0), valor: computeMetric(0, 0, 0, 0) },
        groups: { FAMILY: [], CUSTOMER: [], REP: [], REGION: [] },
      });
    }

    if (entityIdParam && !allowedEntityIds.includes(entityIdParam)) {
      return NextResponse.json({ error: 'Sem permissão na entidade' }, { status: 403 });
    }
    const effectiveEntityId = entityIdParam ?? null;
    const monthOut = monthParam ? String(monthParam) : '';
    const monthsFilter = monthParam ? [monthParam] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

    if (effectiveEntityId) {
      const snaps = await prisma.salesDashboardSnapshot.findMany({
        where: { entityId: effectiveEntityId, year, month: { in: monthsFilter } },
        select: { payload: true },
      });

      let summaryPeso = computeMetric(0, 0, 0, 0);
      let summaryValor = computeMetric(0, 0, 0, 0);
      let family: GroupRow[] = [];
      let customer: GroupRow[] = [];
      let rep: GroupRow[] = [];
      let region: GroupRow[] = [];

      for (const s of snaps) {
        const payload: any = (s?.payload as any) || {};
        const sp = readMetric(payload?.summary?.peso);
        const sv = readMetric(payload?.summary?.valor);

        summaryPeso = computeMetric(
          summaryPeso.metaPrevista + sp.metaPrevista,
          summaryPeso.carregado + sp.carregado,
          summaryPeso.devolucao + sp.devolucao,
          summaryPeso.emCarteira + sp.emCarteira
        );
        summaryValor = computeMetric(
          summaryValor.metaPrevista + sv.metaPrevista,
          summaryValor.carregado + sv.carregado,
          summaryValor.devolucao + sv.devolucao,
          summaryValor.emCarteira + sv.emCarteira
        );

        const g = payload?.groups || {};
        family = mergeGroupRows(family, readGroupRows(g?.FAMILY));
        customer = mergeGroupRows(customer, readGroupRows(g?.CUSTOMER));
        rep = mergeGroupRows(rep, readGroupRows(g?.REP));
        region = mergeGroupRows(region, readGroupRows(g?.REGION));
      }

      if (!isSalesAdmin) {
        const candidates = [
          String(userId),
          String(me?.name || ''),
          String(me?.doc || ''),
        ].filter(Boolean);
        const repRow = pickRepRow(rep, candidates);
        const emptyMetric = computeMetric(0, 0, 0, 0);
        const nextSummaryPeso = repRow?.peso ?? emptyMetric;
        const nextSummaryValor = repRow?.valor ?? emptyMetric;
        const repOnly = repRow ? [repRow] : [];
        family = repRow ? filterGroupRowsByRepPrefix(family, repRow, candidates) : [];
        customer = repRow ? filterGroupRowsByRepPrefix(customer, repRow, candidates) : [];
        region = repRow ? filterGroupRowsByRepPrefix(region, repRow, candidates) : [];
        rep = repOnly;
        summaryPeso = nextSummaryPeso;
        summaryValor = nextSummaryValor;
      }

      return NextResponse.json({
        year,
        month: monthOut,
        entityId: effectiveEntityId,
        summary: { peso: summaryPeso, valor: summaryValor },
        groups: { FAMILY: family, CUSTOMER: customer, REP: rep, REGION: region },
      });
    }

    const snaps = await prisma.salesDashboardSnapshot.findMany({
      where: { entityId: { in: allowedEntityIds }, year, month: { in: monthsFilter } },
      select: { payload: true },
    });

    let summaryPeso = computeMetric(0, 0, 0, 0);
    let summaryValor = computeMetric(0, 0, 0, 0);
    let family: GroupRow[] = [];
    let customer: GroupRow[] = [];
    let rep: GroupRow[] = [];
    let region: GroupRow[] = [];

    for (const s of snaps) {
      const payload: any = (s?.payload as any) || {};
      const sp = readMetric(payload?.summary?.peso);
      const sv = readMetric(payload?.summary?.valor);

      summaryPeso = computeMetric(
        summaryPeso.metaPrevista + sp.metaPrevista,
        summaryPeso.carregado + sp.carregado,
        summaryPeso.devolucao + sp.devolucao,
        summaryPeso.emCarteira + sp.emCarteira
      );
      summaryValor = computeMetric(
        summaryValor.metaPrevista + sv.metaPrevista,
        summaryValor.carregado + sv.carregado,
        summaryValor.devolucao + sv.devolucao,
        summaryValor.emCarteira + sv.emCarteira
      );

      const g = payload?.groups || {};
      family = mergeGroupRows(family, readGroupRows(g?.FAMILY));
      customer = mergeGroupRows(customer, readGroupRows(g?.CUSTOMER));
      rep = mergeGroupRows(rep, readGroupRows(g?.REP));
      region = mergeGroupRows(region, readGroupRows(g?.REGION));
    }

    if (!isSalesAdmin) {
      const candidates = [
        String(userId),
        String(me?.name || ''),
        String(me?.doc || ''),
      ].filter(Boolean);
      const repRow = pickRepRow(rep, candidates);
      const emptyMetric = computeMetric(0, 0, 0, 0);
      const nextSummaryPeso = repRow?.peso ?? emptyMetric;
      const nextSummaryValor = repRow?.valor ?? emptyMetric;
      const repOnly = repRow ? [repRow] : [];
      family = repRow ? filterGroupRowsByRepPrefix(family, repRow, candidates) : [];
      customer = repRow ? filterGroupRowsByRepPrefix(customer, repRow, candidates) : [];
      region = repRow ? filterGroupRowsByRepPrefix(region, repRow, candidates) : [];
      rep = repOnly;
      summaryPeso = nextSummaryPeso;
      summaryValor = nextSummaryValor;
    }

    return NextResponse.json({
      year,
      month: monthOut,
      entityId: null,
      summary: { peso: summaryPeso, valor: summaryValor },
      groups: { FAMILY: family, CUSTOMER: customer, REP: rep, REGION: region },
    });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
