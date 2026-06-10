import { NextResponse } from 'next/server';
import { prisma } from '../../../../../../lib/prisma';
import { loadClientLookup, normalizeDoc, parseInteger, resolveClientFromLookup } from '../../../../../../lib/bulkIntegration';

type LinkPayload = {
  repCode?: number | string | null;
  repDoc?: string | null;
  clientCode?: number | string | null;
  clientDoc?: string | null;
};

async function ensureUserRepCodeColumn(): Promise<void> {
  const g = global as any;
  if (g.__userRepCodeEnsuredBulkLink) return;
  try {
    const rows = (await prisma.$queryRawUnsafe(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user' AND COLUMN_NAME IN ('repCode')"
    )) as any[];
    const existing = new Set<string>((Array.isArray(rows) ? rows : []).map((row) => String(row?.COLUMN_NAME || row?.column_name || '').trim()));
    if (!existing.has('repCode')) {
      await prisma.$executeRawUnsafe('ALTER TABLE `user` ADD COLUMN `repCode` INT NULL');
    }
  } catch {}
  g.__userRepCodeEnsuredBulkLink = true;
}

function parseRepDoc(payload: LinkPayload): string | null {
  const doc = normalizeDoc(payload?.repDoc || '');
  return doc || null;
}

function parseRepCode(payload: LinkPayload): number | null {
  return parseInteger(payload?.repCode);
}

export async function POST(request: Request) {
  try {
    await ensureUserRepCodeColumn();

    const body = await request.json().catch(() => ({} as any));
    const links = Array.isArray(body?.links) ? (body.links as LinkPayload[]) : [];
    if (!links.length) {
      return NextResponse.json({ error: 'links é obrigatório e deve ser um array não vazio' }, { status: 400 });
    }

    const clientLookup = await loadClientLookup(
      links.map((item) => ({ doc: item.clientDoc, clientCode: item.clientCode }))
    );

    const repDocs = Array.from(new Set(links.map((item) => parseRepDoc(item)).filter((doc): doc is string => !!doc)));
    const repCodes = Array.from(new Set(links.map((item) => parseRepCode(item)).filter((code): code is number => Number.isFinite(code) && code > 0)));

    const repUsers = await prisma.user.findMany({
      where: {
        salesRepAdmin: true,
        OR: [
          ...(repDocs.length ? [{ doc: { in: repDocs } }] : []),
          ...(repCodes.length ? [{ repCode: { in: repCodes } }] : []),
        ],
      },
      select: { id: true, doc: true, repCode: true },
    });

    const repByDoc = new Map(repUsers.map((user) => [normalizeDoc(user.doc || ''), user]));
    const repByCode = new Map<number, typeof repUsers>();
    for (const user of repUsers) {
      if (typeof user.repCode !== 'number') continue;
      const key = Number(user.repCode);
      repByCode.set(key, [...(repByCode.get(key) ?? []), user]);
    }

    const uniquePairs = new Map<string, { userId: number; clientId: number }>();
    const results: Array<{ repCode: number | null; clientCode: number | null; repId?: number; clientId?: number; linked?: boolean; error?: string }> = [];

    for (const payload of links) {
      const repDoc = parseRepDoc(payload);
      const repCode = parseRepCode(payload);
      const repByDocMatch = repDoc ? repByDoc.get(repDoc) ?? null : null;
      const repByCodeMatches = repCode ? repByCode.get(repCode) ?? [] : [];
      if (!repByDocMatch && repCode && repByCodeMatches.length > 1) {
        results.push({ repCode, clientCode: parseInteger(payload?.clientCode), error: 'repCode ambíguo; existe mais de um representante com esse código' });
        continue;
      }
      const rep = repByDocMatch ?? (repByCodeMatches.length === 1 ? repByCodeMatches[0] : null);

      if (!rep) {
        results.push({ repCode, clientCode: parseInteger(payload?.clientCode), error: 'representante não encontrado' });
        continue;
      }

      const resolvedClient = resolveClientFromLookup({ doc: payload?.clientDoc, clientCode: payload?.clientCode }, clientLookup);
      if (resolvedClient.error) {
        results.push({ repCode, clientCode: parseInteger(payload?.clientCode), repId: rep.id, error: resolvedClient.error });
        continue;
      }
      if (!resolvedClient.client?.id) {
        results.push({ repCode, clientCode: parseInteger(payload?.clientCode), repId: rep.id, error: 'cliente não encontrado' });
        continue;
      }

      const key = `${rep.id}::${resolvedClient.client.id}`;
      if (!uniquePairs.has(key)) {
        uniquePairs.set(key, { userId: rep.id, clientId: resolvedClient.client.id });
      }

      results.push({
        repCode,
        clientCode: resolvedClient.client.clientCode ?? parseInteger(payload?.clientCode),
        repId: rep.id,
        clientId: resolvedClient.client.id,
        linked: true,
      });
    }

    if (uniquePairs.size > 0) {
      await prisma.userClientRep.createMany({
        data: Array.from(uniquePairs.values()),
        skipDuplicates: true,
      });
    }

    return NextResponse.json({ results });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
