import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { isProgramAllowed } from "../../../../lib/isProgramAllowed";

async function ensureReadAllowed(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  const userId = session?.user ? Number((session.user as any).id) : NaN;
  const entityIdRaw = (session as any)?.activeEntityId ?? (session as any)?.entityId ?? (session?.user as any)?.lastEntityId ?? null;
  const entityId = entityIdRaw == null ? NaN : Number(entityIdRaw);
  if (!Number.isFinite(userId) || userId <= 0) return false;
  if (!Number.isFinite(entityId) || entityId <= 0) return false;
  const canTags = await isProgramAllowed(userId, entityId, "TAG_OCORRENCIA").catch(() => false);
  if (canTags) return true;
  return await isProgramAllowed(userId, entityId, "PROCESSOS_SACSGQ").catch(() => false);
}

async function ensureWriteAllowed(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  const userId = session?.user ? Number((session.user as any).id) : NaN;
  const entityIdRaw = (session as any)?.activeEntityId ?? (session as any)?.entityId ?? (session?.user as any)?.lastEntityId ?? null;
  const entityId = entityIdRaw == null ? NaN : Number(entityIdRaw);
  if (!Number.isFinite(userId) || userId <= 0) return false;
  if (!Number.isFinite(entityId) || entityId <= 0) return false;
  return await isProgramAllowed(userId, entityId, "TAG_OCORRENCIA").catch(() => false);
}

async function ensureOccurrenceTagTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`occurrencetag\` (
      \`code\` INT NOT NULL,
      \`description\` CHAR(60) NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`code\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

function validateCode(code: number) {
  if (!Number.isFinite(code) || code <= 0 || !Number.isInteger(code)) return "Cód Tag inválido";
  if (String(Math.trunc(code)).length > 6) return "Cód Tag excede 6 dígitos";
  return null;
}

function validateDescription(description: string) {
  if (!description) return "Descrição é obrigatória";
  if (description.length > 60) return "Descrição excede 60 caracteres";
  return null;
}

export async function GET(request: Request) {
  try {
    if (!(await ensureReadAllowed())) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    await ensureOccurrenceTagTable();
    const url = new URL(request.url);
    const q = String(url.searchParams.get("q") || "").trim();

    const rows = await prisma.occurrenceTag.findMany({
      where: q
        ? {
            OR: [
              { description: { contains: q } },
              Number.isFinite(Number(q)) ? { code: Math.trunc(Number(q)) } : {},
            ],
          }
        : undefined,
      orderBy: [{ code: "asc" }],
      select: { code: true, description: true },
    });

    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await ensureWriteAllowed())) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    await ensureOccurrenceTagTable();
    const body = await request.json().catch(() => ({}));
    const code = Number(body?.code);
    const description = String(body?.description || "").trim();

    const codeError = validateCode(code);
    if (codeError) return NextResponse.json({ error: codeError }, { status: 400 });

    const descriptionError = validateDescription(description);
    if (descriptionError) return NextResponse.json({ error: descriptionError }, { status: 400 });

    const created = await prisma.occurrenceTag.create({
      data: { code: Math.trunc(code), description },
      select: { code: true, description: true },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("duplicate")) {
      return NextResponse.json({ error: "Já existe uma TAG com este código" }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
