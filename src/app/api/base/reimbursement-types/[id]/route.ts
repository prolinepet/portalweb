import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";

async function ensureReimbursementTypeTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`reimbursementtype\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`description\` VARCHAR(100) NOT NULL,
      \`defaultAccountingAccount\` CHAR(10) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE \`reimbursementtype\`
    ADD COLUMN IF NOT EXISTS \`defaultAccountingAccount\` CHAR(10) NULL AFTER \`description\`
  `);
}

export async function GET(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await ensureReimbursementTypeTable();
    const id = Number(params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const row = await prisma.reimbursementType.findUnique({
      where: { id: Math.trunc(id) },
      select: { id: true, description: true, defaultAccountingAccount: true },
    });

    if (!row) {
      return NextResponse.json({ error: "Tipo de reembolso não encontrado" }, { status: 404 });
    }

    return NextResponse.json(row);
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await ensureReimbursementTypeTable();
    const id = Number(params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const description = String(body?.description || "").trim();
    const defaultAccountingAccountRaw = String(body?.defaultAccountingAccount || "").trim();
    const defaultAccountingAccount = defaultAccountingAccountRaw || null;
    if (!description) {
      return NextResponse.json({ error: "Descrição é obrigatória" }, { status: 400 });
    }
    if (description.length > 100) {
      return NextResponse.json({ error: "Descrição excede 100 caracteres" }, { status: 400 });
    }
    if (defaultAccountingAccount && defaultAccountingAccount.length > 10) {
      return NextResponse.json({ error: "Conta Contábil Padrão excede 10 caracteres" }, { status: 400 });
    }

    const updated = await prisma.reimbursementType.update({
      where: { id: Math.trunc(id) },
      data: { description, defaultAccountingAccount },
      select: { id: true, description: true, defaultAccountingAccount: true },
    });

    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function DELETE(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await ensureReimbursementTypeTable();
    const id = Number(params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    await prisma.reimbursementType.delete({ where: { id: Math.trunc(id) } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
