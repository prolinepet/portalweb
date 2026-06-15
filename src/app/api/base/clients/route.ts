import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';

function normalizeDoc(doc: string): string {
  return (doc || '').replace(/\D+/g, '');
}

async function ensureClientContactColumns(): Promise<void> {
  const existing = await prisma.$queryRawUnsafe<any[]>(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'client' AND COLUMN_NAME IN ('email','phone')"
  );
  const set = new Set((existing || []).map((r) => String(r.COLUMN_NAME || r.column_name || '').toLowerCase()));
  if (!set.has('email')) {
    await prisma.$executeRawUnsafe("ALTER TABLE `client` ADD COLUMN `email` VARCHAR(191) NULL");
  }
  if (!set.has('phone')) {
    await prisma.$executeRawUnsafe("ALTER TABLE `client` ADD COLUMN `phone` VARCHAR(30) NULL");
  }
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
    const term = await prisma.paymentTerm.findFirst({
      where: { description: { equals: descCandidate } },
      select: { id: true },
    }).catch(() => null);
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

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id ? Number((session?.user as any).id) : null;
    
    // Se não houver usuário logado, retorna lista vazia (ou erro 401 se preferir)
    if (!userId) return NextResponse.json([]);

    await ensureClientContactColumns().catch(() => {});

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isSalesAdmin: true }
    });
    const isSalesAdmin = Boolean(user?.isSalesAdmin);

    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim();
    const digits = q ? normalizeDoc(q) : '';
    const qNum = q ? Number(q) : NaN;
    const idCandidate = Number.isFinite(qNum) ? Math.trunc(qNum) : null;

    const where: any = {};
    if (!isSalesAdmin) where.reps = { some: { userId } };

    if (q) {
      const or: any[] = [
        { name: { contains: q } },
        { abbrevName: { contains: q } },
        { cidade: { contains: q } },
        { estado: { contains: q } },
      ];
      if (digits) or.push({ doc: { contains: digits } });
      if (idCandidate !== null) or.push({ id: idCandidate });
      if (idCandidate !== null) or.push({ clientCode: idCandidate });
      where.OR = or;
    }

    const clients = await prisma.client.findMany({
      where,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        clientCode: true,
        doc: true,
        abbrevName: true,
        name: true,
        email: true,
        phone: true,
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

    const out = clients.map((c) => ({
      id: c.id,
      clientCode: c.clientCode,
      doc: c.doc,
      abbrevName: c.abbrevName,
      name: c.name,
      email: (c as any).email ?? null,
      phone: (c as any).phone ?? null,
      cep: c.cep,
      logradouro: c.logradouro,
      numero: c.numero,
      bairro: c.bairro,
      cidade: c.cidade,
      estado: c.estado,
      creditLimit: c.creditLimit,
      availableLimit: c.availableLimit,
      titlesDue: c.titlesDue,
      titlesOverdue: c.titlesOverdue,
      paymentTermId: c.paymentTermId,
      paymentTermCode: c.paymentTerm?.code ?? null,
      paymentTermDescription: c.paymentTerm?.description ?? null,
    }));
    return NextResponse.json(out);
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const clientCode =
      parseClientCode(body?.clientCode) ??
      parseClientCode(body?.codCliente) ??
      parseClientCode(body?.codcliente) ??
      parseClientCode(body?.codigoCliente) ??
      parseClientCode(body?.codCli) ??
      parseClientCode(body?.codcli) ??
      null;
    const doc = normalizeDoc(String(body?.doc || '')) || null;
    const abbrevNameRaw = String(body?.abbrevName || '').trim();
    const abbrevName = abbrevNameRaw ? abbrevNameRaw.slice(0, 20) : null;
    const name = String(body?.name || '').trim();
    const cep = String(body?.cep || '').trim() || null;
    const logradouro = String(body?.logradouro || '').trim() || null;
    const numero = String(body?.numero || '').trim() || null;
    const bairro = String(body?.bairro || '').trim() || null;
    const cidade = String(body?.cidade || '').trim() || null;
    const estado = String(body?.estado || '').trim() || null;
    const paymentTermIds = await resolvePaymentTermIds(body);
    const listProvided = paymentTermIds !== null;
    const paymentTermId = listProvided ? (paymentTermIds[0] ?? null) : await resolvePaymentTermId(body);
    if (!name) return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
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

    const syncPaymentTermIds = listProvided ? paymentTermIds : (paymentTermId ? [paymentTermId] : null);

    const created = await prisma.$transaction(async (tx) => {
      const baseData: any = {
        clientCode,
        abbrevName,
        name,
        cep,
        logradouro,
        numero,
        bairro,
        cidade,
        estado,
      };

      if (listProvided) {
        baseData.paymentTermId = paymentTermId;
      } else if (paymentTermId !== null) {
        baseData.paymentTermId = paymentTermId;
      }

      const client = doc
        ? await tx.client.upsert({
            where: { doc },
            update: baseData,
            create: { ...baseData, doc },
            select: { id: true, clientCode: true, doc: true, abbrevName: true, name: true, cep: true, logradouro: true, numero: true, bairro: true, cidade: true, estado: true, paymentTermId: true },
          })
        : await tx.client.create({
            data: { ...baseData, doc: null },
            select: { id: true, clientCode: true, doc: true, abbrevName: true, name: true, cep: true, logradouro: true, numero: true, bairro: true, cidade: true, estado: true, paymentTermId: true },
          });

      if (syncPaymentTermIds !== null) {
        await tx.clientPaymentTerm.deleteMany({ where: { clientId: client.id } });
        if (syncPaymentTermIds.length > 0) {
          await tx.clientPaymentTerm.createMany({
            data: syncPaymentTermIds.map((id, idx) => ({
              clientId: client.id,
              paymentTermId: id,
              position: idx,
            })),
            skipDuplicates: true,
          });
        }
      }

      return client;
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
