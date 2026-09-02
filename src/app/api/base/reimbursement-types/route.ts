import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

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

export async function GET(request: Request) {
  try {
    await ensureReimbursementTypeTable();
    const url = new URL(request.url);
    const q = String(url.searchParams.get("q") || "").trim();

    const rows = await prisma.reimbursementType.findMany({
      where: q
        ? {
            OR: [
              { description: { contains: q } },
              { defaultAccountingAccount: { contains: q } },
            ],
          }
        : undefined,
      orderBy: [{ description: "asc" }, { id: "asc" }],
      select: { id: true, description: true, defaultAccountingAccount: true },
    });

    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureReimbursementTypeTable();
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

    const created = await prisma.reimbursementType.create({
      data: { description, defaultAccountingAccount },
      select: { id: true, description: true, defaultAccountingAccount: true },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
