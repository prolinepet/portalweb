import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

function normalizeDoc(doc: string): string {
  return (doc || '').replace(/\D+/g, '');
}

function parseClientCode(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : null;
  const s = String(v).trim();
  if (!s) return null;
  const digits = s.replace(/\D/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

async function ensurePaymentTermByCode(code: number): Promise<number | null> {
  const c = Number(code);
  if (!Number.isFinite(c) || c <= 0) return null;
  const row = await prisma.paymentTerm
    .upsert({
      where: { code: Math.trunc(c) },
      update: {},
      create: { code: Math.trunc(c), description: `Condição ${Math.trunc(c)}`, installments: 1 },
      select: { id: true },
    })
    .catch(() => null);
  return row?.id ? Number(row.id) : null;
}

async function resolvePaymentTermId(body: any): Promise<number | null> {
  const nested =
    body && typeof body === 'object'
      ? (body?.paymentTerm && typeof body.paymentTerm === 'object' ? body.paymentTerm : null) ??
        (body?.paymentTerms && typeof body.paymentTerms === 'object' ? body.paymentTerms : null) ??
        (body?.condPagto && typeof body.condPagto === 'object' ? body.condPagto : null) ??
        null
      : null;
  if (nested) {
    const nestedId = await resolvePaymentTermId(nested);
    if (nestedId) return nestedId;
  }

  const num = (v: any): number | null => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : null;
    const s = String(v).trim();
    if (!s) return null;
    const digits = s.replace(/\D/g, '');
    if (!digits) return null;
    const n = Number(digits);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  };

  const str = (v: any): string | null => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s ? s : null;
  };

  const idCandidate =
    num(body?.paymentTermId) ??
    num(body?.paymentTermsId) ??
    num(body?.condPagtoId) ??
    num(body?.id) ??
    null;
  if (idCandidate) return idCandidate;

  const codeCandidate =
    num(body?.paymentTermsErp) ??
    num(body?.paymentTermCode) ??
    num(body?.paymentTermsCode) ??
    num(body?.condPagtoCode) ??
    num(body?.condPagto) ??
    num(body?.code) ??
    num(body?.codigo) ??
    null;
  if (codeCandidate) {
    const term = await prisma.paymentTerm.findFirst({ where: { code: codeCandidate }, select: { id: true } }).catch(() => null);
    if (term?.id) return term.id;
    const createdId = await ensurePaymentTermByCode(codeCandidate);
    if (createdId) return createdId;
  }

  const descCandidate =
    str(body?.paymentTermDescription) ??
    str(body?.paymentTermsDescription) ??
    str(body?.condPagtoDescription) ??
    str(body?.condPagtoDesc) ??
    str(body?.description) ??
    str(body?.descricao) ??
    str(body?.paymentTerms) ??
    str(body?.paymentTerm) ??
    null;
  if (descCandidate) {
    const term = await prisma.paymentTerm
      .findFirst({ where: { description: { equals: descCandidate } }, select: { id: true } })
      .catch(() => null);
    if (term?.id) return term.id;
  }

  return null;
}

function extractPaymentTermList(body: any): any[] | null {
  const candidates = [
    body?.paymentTermIds,
    body?.paymentTermsIds,
    body?.paymentTermsList,
    body?.paymentTerms,
    body?.condPagtoList,
    body?.condPagtoLista,
    body?.condicoesPagamento,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }
  return null;
}

function extractPriceTableList(body: any): any[] | null {
  const candidates = [
    body?.priceTableIds,
    body?.priceTablesIds,
    body?.priceTablesList,
    body?.priceTables,
    body?.tabPrecos,
    body?.tabPrecoList,
    body?.nrtabpreList,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }
  return null;
}

async function resolvePaymentTermIdFromAny(v: any): Promise<number | null> {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return resolvePaymentTermId(v);

  const s = String(v).trim();
  if (!s) return null;
  const digits = s.replace(/\D/g, '');
  if (!digits) {
    const byDesc = await prisma.paymentTerm
      .findFirst({ where: { description: { equals: s } }, select: { id: true } })
      .catch(() => null);
    if (byDesc?.id) return byDesc.id;
    return null;
  }
  const n = Number(digits);
  if (!Number.isFinite(n)) return null;

  const byCode = await prisma.paymentTerm.findFirst({ where: { code: Math.trunc(n) }, select: { id: true } }).catch(() => null);
  if (byCode?.id) return byCode.id;
  const createdId = await ensurePaymentTermByCode(Math.trunc(n));
  if (createdId) return createdId;

  const byId = await prisma.paymentTerm.findFirst({ where: { id: Math.trunc(n) }, select: { id: true } }).catch(() => null);
  if (byId?.id) return byId.id;

  return null;
}

async function resolvePaymentTermIds(body: any): Promise<number[] | null> {
  const list = extractPaymentTermList(body);
  if (!list) return null;
  const out: number[] = [];
  const seen = new Set<number>();
  for (const it of list) {
    const id = await resolvePaymentTermIdFromAny(it);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

async function ensurePriceTableByNr(nrtabpreRaw: string): Promise<number | null> {
  const nrtabpre = String(nrtabpreRaw || '').trim();
  if (!nrtabpre) return null;
  const row = await prisma.priceTable
    .upsert({
      where: { nrtabpre },
      update: {},
      create: { nrtabpre, descricao: `Tabela ${nrtabpre}`, situacao: 1 },
      select: { id: true },
    })
    .catch(() => null);
  return row?.id ? Number(row.id) : null;
}

async function resolvePriceTableIdFromAny(v: any): Promise<number | null> {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    const anyV: any = v;
    const rawId =
      anyV?.priceTableId ??
      anyV?.priceTableID ??
      anyV?.id ??
      null;
    const idNum = Number(rawId);
    if (Number.isFinite(idNum) && idNum > 0) return Math.trunc(idNum);

    const nr =
      anyV?.nrtabpre ??
      anyV?.nrTabpre ??
      anyV?.nr_tabpre ??
      anyV?.nr_tab_pre ??
      null;
    if (nr != null) return await ensurePriceTableByNr(String(nr));
    return null;
  }

  const s = String(v).trim();
  if (!s) return null;

  const byNr = await prisma.priceTable.findFirst({ where: { nrtabpre: s }, select: { id: true } }).catch(() => null);
  if (byNr?.id) return Number(byNr.id);
  const createdId = await ensurePriceTableByNr(s);
  if (createdId) return createdId;

  const digits = s.replace(/\D/g, '');
  const n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return null;
  const byId = await prisma.priceTable.findUnique({ where: { id: Math.trunc(n) }, select: { id: true } }).catch(() => null);
  return byId?.id ? Number(byId.id) : null;
}

async function resolvePriceTableIds(body: any): Promise<number[] | null> {
  const list = extractPriceTableList(body);
  if (!list) return null;
  const out: number[] = [];
  const seen = new Set<number>();
  for (const it of list) {
    const id = await resolvePriceTableIdFromAny(it);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export async function GET(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = Number(params.id);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    }
    const client = await prisma.client.findUnique({
      where: { id: Math.trunc(id) },
      select: {
        id: true,
        clientCode: true,
        doc: true,
        abbrevName: true,
        name: true,
        cep: true,
        logradouro: true,
        numero: true,
        bairro: true,
        cidade: true,
        estado: true,
        creditLimit: true,
        availableLimit: true,
        titlesDue: true,
        titlesOverdue: true,
        paymentTermId: true,
        paymentTerm: { select: { code: true, description: true } },
      },
    });
    if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    return NextResponse.json({
      ...client,
      paymentTermCode: client.paymentTerm?.code ?? null,
      paymentTermDescription: client.paymentTerm?.description ?? null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = Number(params.id);
    if (!Number.isFinite(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }
    const fields: any = {};
    if (body.doc !== undefined) fields.doc = normalizeDoc(String(body.doc || '')) || null;
    if (body.clientCode !== undefined || body.codCliente !== undefined || body.codcliente !== undefined || body.codigoCliente !== undefined || body.codCli !== undefined || body.codcli !== undefined) {
      fields.clientCode =
        parseClientCode(body?.clientCode) ??
        parseClientCode(body?.codCliente) ??
        parseClientCode(body?.codcliente) ??
        parseClientCode(body?.codigoCliente) ??
        parseClientCode(body?.codCli) ??
        parseClientCode(body?.codcli) ??
        null;
    }
    if (body.abbrevName !== undefined) {
      const raw = String(body.abbrevName || '').trim();
      fields.abbrevName = raw ? raw.slice(0, 20) : null;
    }
    if (body.name !== undefined) fields.name = String(body.name || '').trim();
    if (body.cep !== undefined) fields.cep = String(body.cep || '').trim() || null;
    if (body.logradouro !== undefined) fields.logradouro = String(body.logradouro || '').trim() || null;
    if (body.numero !== undefined) fields.numero = String(body.numero || '').trim() || null;
    if (body.bairro !== undefined) fields.bairro = String(body.bairro || '').trim() || null;
    if (body.cidade !== undefined) fields.cidade = String(body.cidade || '').trim() || null;
    if (body.estado !== undefined) fields.estado = String(body.estado || '').trim() || null;
    const paymentTermIds = await resolvePaymentTermIds(body);
    const listProvided = paymentTermIds !== null;
    const singleProvided = !listProvided && (body.paymentTermId !== undefined || body.paymentTermCode !== undefined || body.condPagto !== undefined || body.condPagtoCode !== undefined);
    const priceTableIds = await resolvePriceTableIds(body);
    const priceListProvided = priceTableIds !== null;
    if (listProvided && paymentTermIds.length === 0) {
      const rawList = extractPaymentTermList(body) ?? [];
      const hasMeaningful = rawList.some((it) => {
        if (it === null || it === undefined) return false;
        if (typeof it === 'number') return Number.isFinite(it) && it > 0;
        if (typeof it === 'string') {
          const s = it.trim();
          if (!s) return false;
          const digits = s.replace(/\D/g, '');
          return digits ? Number(digits) > 0 : true;
        }
        if (typeof it === 'object') {
          const anyIt: any = it;
          const candidates = [anyIt?.code, anyIt?.codigo, anyIt?.id, anyIt?.paymentTermCode, anyIt?.paymentTermId, anyIt?.condPagtoCode, anyIt?.condPagtoId, anyIt?.condPagto];
          for (const c of candidates) {
            const n = Number(String(c ?? '').replace(/\D/g, ''));
            if (Number.isFinite(n) && n > 0) return true;
          }
          const desc = String(anyIt?.description ?? anyIt?.descricao ?? anyIt?.condPagtoDescription ?? anyIt?.paymentTermDescription ?? '').trim();
          return desc.length > 0;
        }
        return false;
      });
      if (hasMeaningful) {
        return NextResponse.json(
          { error: 'condicoesPagamento informado, mas nenhuma condição foi reconhecida (verifique se o código existe em paymentterm.code)' },
          { status: 400 }
        );
      }
    }
    if (listProvided) {
      fields.paymentTermId = paymentTermIds[0] ?? null;
    } else if (singleProvided) {
      fields.paymentTermId = await resolvePaymentTermId(body);
    }
    const setCols = Object.keys(fields);
    if (setCols.length === 0) return NextResponse.json({ message: 'Nada para atualizar' }, { status: 400 });
    const data: any = {};
    for (const k of setCols) data[k] = (fields as any)[k];

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.client.update({
        where: { id: Math.trunc(id) },
        data,
        select: {
          id: true,
          clientCode: true,
          doc: true,
          abbrevName: true,
          name: true,
          cep: true,
          logradouro: true,
          numero: true,
          bairro: true,
          cidade: true,
          estado: true,
          creditLimit: true,
          availableLimit: true,
          titlesDue: true,
          titlesOverdue: true,
          paymentTermId: true,
          paymentTerm: { select: { code: true, description: true } },
        },
      });

      if (listProvided || singleProvided) {
        const syncIds = listProvided ? paymentTermIds : (row.paymentTermId ? [row.paymentTermId] : []);
        await tx.clientPaymentTerm.deleteMany({ where: { clientId: row.id } });
        if (syncIds.length > 0) {
          await tx.clientPaymentTerm.createMany({
            data: syncIds.map((ptId, idx) => ({
              clientId: row.id,
              paymentTermId: ptId,
              position: idx,
            })),
            skipDuplicates: true,
          });
        }
      }

      if (priceListProvided) {
        await tx.clientPriceTable.deleteMany({ where: { clientId: row.id } });
        if (priceTableIds.length > 0) {
          await tx.clientPriceTable.createMany({
            data: priceTableIds.map((ptId) => ({
              clientId: row.id,
              priceTableId: ptId,
            })),
            skipDuplicates: true,
          });
        }
      }

      return row;
    });

    return NextResponse.json({
      ...updated,
      paymentTermCode: updated.paymentTerm?.code ?? null,
      paymentTermDescription: updated.paymentTerm?.description ?? null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function DELETE(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = Number(params.id);
    if (!Number.isFinite(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
    await prisma.client.delete({ where: { id: Math.trunc(id) } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
