import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../lib/auth";
import { isProgramAllowed } from "../../../../../lib/isProgramAllowed";

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
      \`code\` INT NOT NULL AUTO_INCREMENT,
      \`description\` CHAR(60) NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`code\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await prisma.$executeRawUnsafe("ALTER TABLE `occurrencetag` MODIFY COLUMN `code` INT NOT NULL AUTO_INCREMENT").catch(() => {});
}

function parseCode(raw: string) {
  const code = Number(raw);
  if (!Number.isFinite(code) || code <= 0 || !Number.isInteger(code)) return null;
  return Math.trunc(code);
}

function validateDescription(description: string) {
  if (!description) return "Descrição é obrigatória";
  if (description.length > 60) return "Descrição excede 60 caracteres";
  return null;
}

export async function GET(_: Request, props: { params: Promise<{ code: string }> }) {
  const params = await props.params;
  try {
    if (!(await ensureReadAllowed())) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    await ensureOccurrenceTagTable();
    const code = parseCode(params.code);
    if (!code) return NextResponse.json({ error: "Cód Tag inválido" }, { status: 400 });

    const row = await prisma.occurrenceTag.findUnique({
      where: { code },
      select: { code: true, description: true },
    });

    if (!row) {
      return NextResponse.json({ error: "TAG não encontrada" }, { status: 404 });
    }

    return NextResponse.json(row);
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function PATCH(request: Request, props: { params: Promise<{ code: string }> }) {
  const params = await props.params;
  try {
    if (!(await ensureWriteAllowed())) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    await ensureOccurrenceTagTable();
    const code = parseCode(params.code);
    if (!code) return NextResponse.json({ error: "Cód Tag inválido" }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const description = String(body?.description || "").trim();
    const descriptionError = validateDescription(description);
    if (descriptionError) return NextResponse.json({ error: descriptionError }, { status: 400 });

    const updated = await prisma.occurrenceTag.update({
      where: { code },
      data: { description },
      select: { code: true, description: true },
    });

    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function DELETE(_: Request, props: { params: Promise<{ code: string }> }) {
  const params = await props.params;
  try {
    if (!(await ensureWriteAllowed())) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    await ensureOccurrenceTagTable();
    const code = parseCode(params.code);
    if (!code) return NextResponse.json({ error: "Cód Tag inválido" }, { status: 400 });

    await prisma.occurrenceTag.delete({ where: { code } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
