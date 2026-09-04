import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  ensureUserReimbursementTypeAccountingAccountTable,
  normalizeAccountingAccount,
} from "@/lib/user-reimbursement-accounting";

function parseId(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

export async function GET(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;

  try {
    await ensureUserReimbursementTypeAccountingAccountTable();

    const userId = parseId(params.id);
    if (!userId) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const [user, reimbursementTypes, userAccounts] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
      prisma.reimbursementType.findMany({
        orderBy: { description: "asc" },
        select: { id: true, description: true, defaultAccountingAccount: true },
      }),
      prisma.$queryRawUnsafe<Array<{ reimbursementTypeId: number; accountingAccount: string }>>(`
        SELECT reimbursementTypeId, accountingAccount
        FROM userreimbursementtypeaccount
        WHERE userId = ${userId}
      `),
    ]);

    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    const accountsMap = new Map<number, string>(
      userAccounts.map((item) => [Number(item.reimbursementTypeId), String(item.accountingAccount || "")])
    );

    return NextResponse.json({
      items: reimbursementTypes.map((item) => ({
        reimbursementTypeId: item.id,
        description: item.description,
        defaultAccountingAccount: String(item.defaultAccountingAccount || ""),
        accountingAccount: accountsMap.get(item.id) || "",
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;

  try {
    await ensureUserReimbursementTypeAccountingAccountTable();

    const userId = parseId(params.id);
    if (!userId) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({} as any));
    const rawItems = Array.isArray(body?.items) ? body.items : [];

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    const parsedItems = rawItems
      .map((item: any) => ({
        reimbursementTypeId: parseId(String(item?.reimbursementTypeId ?? "")),
        accountingAccount: normalizeAccountingAccount(item?.accountingAccount),
      }))
      .filter((item) => item.reimbursementTypeId);

    for (const item of parsedItems) {
      if (item.accountingAccount.length > 10) {
        return NextResponse.json(
          { error: "Conta contábil deve ter no máximo 10 caracteres." },
          { status: 400 }
        );
      }
    }

    const reimbursementTypeIds = [...new Set(parsedItems.map((item) => Number(item.reimbursementTypeId)))];
    if (reimbursementTypeIds.length > 0) {
      const existingTypes = await prisma.reimbursementType.findMany({
        where: { id: { in: reimbursementTypeIds } },
        select: { id: true },
      });
      const existingTypeIds = new Set(existingTypes.map((item) => Number(item.id)));
      const invalidTypeId = reimbursementTypeIds.find((id) => !existingTypeIds.has(id));
      if (invalidTypeId) {
        return NextResponse.json({ error: "Tipo de reembolso inválido." }, { status: 400 });
      }
    }

    const rowsToPersist = parsedItems
      .filter((item) => item.accountingAccount)
      .map((item) => ({
        userId,
        reimbursementTypeId: Number(item.reimbursementTypeId),
        accountingAccount: item.accountingAccount,
      }));

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`DELETE FROM userreimbursementtypeaccount WHERE userId = ${userId}`);
      if (rowsToPersist.length > 0) {
        for (const row of rowsToPersist) {
          const accountingAccountSql = String(row.accountingAccount || "").replace(/'/g, "''");
          await tx.$executeRawUnsafe(`
            INSERT INTO userreimbursementtypeaccount (userId, reimbursementTypeId, accountingAccount)
            VALUES (${row.userId}, ${row.reimbursementTypeId}, '${accountingAccountSql}')
          `);
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}
