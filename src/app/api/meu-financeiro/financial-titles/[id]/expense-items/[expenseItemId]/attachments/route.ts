import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import path from "path";
import { authOptions } from "../../../../../../../../lib/auth";
import {
  ensureFinancialTitleExpenseAttachmentTable,
  ensureFinancialTitleExpenseTable,
  ensureFinancialTitleTable,
  getFinancialTitleExpenseAttachmentDir,
  parsePositiveInt,
  resolveActiveEntityId,
  sanitizeFinancialAttachmentFileName,
} from "../../../../../../../../lib/financial-titles";
import { prisma } from "../../../../../../../../lib/prisma";

export async function GET(_: Request, props: { params: Promise<{ id: string; expenseItemId: string }> }) {
  const params = await props.params;

  try {
    await ensureFinancialTitleTable();
    await ensureFinancialTitleExpenseTable();
    await ensureFinancialTitleExpenseAttachmentTable();

    const { entityId } = await resolveActiveEntityId();
    if (!entityId) {
      return NextResponse.json({ error: "Entidade ativa não definida" }, { status: 400 });
    }

    const id = parsePositiveInt(params.id);
    const expenseItemId = parsePositiveInt(params.expenseItemId);
    if (!id || !expenseItemId) {
      return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
    }

    const expenseItem = await prisma.financialTitleExpense.findFirst({
      where: {
        id: expenseItemId,
        financialTitleId: id,
        financialTitle: { entityId },
      },
      select: { id: true },
    });
    if (!expenseItem?.id) {
      return NextResponse.json({ error: "Despesa não encontrada" }, { status: 404 });
    }

    const items = await prisma.financialTitleExpenseAttachment.findMany({
      where: { financialTitleExpenseId: expenseItemId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        originalFileName: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true, abbrevName: true } },
      },
    });

    return NextResponse.json({ ok: true, items });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}

export async function POST(request: Request, props: { params: Promise<{ id: string; expenseItemId: string }> }) {
  const params = await props.params;

  try {
    await ensureFinancialTitleTable();
    await ensureFinancialTitleExpenseTable();
    await ensureFinancialTitleExpenseAttachmentTable();

    const session = await getServerSession(authOptions);
    const userId = session?.user ? Number((session.user as any).id) : null;
    if (!userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { entityId } = await resolveActiveEntityId();
    if (!entityId) {
      return NextResponse.json({ error: "Entidade ativa não definida" }, { status: 400 });
    }

    const id = parsePositiveInt(params.id);
    const expenseItemId = parsePositiveInt(params.expenseItemId);
    if (!id || !expenseItemId) {
      return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
    }

    const expenseItem = await prisma.financialTitleExpense.findFirst({
      where: {
        id: expenseItemId,
        financialTitleId: id,
        financialTitle: { entityId },
      },
      select: {
        id: true,
        financialTitle: { select: { integrated: true } },
      },
    });
    if (!expenseItem?.id) {
      return NextResponse.json({ error: "Despesa não encontrada" }, { status: 404 });
    }
    if (expenseItem.financialTitle.integrated) {
      return NextResponse.json({ error: "Reembolso integrado pode apenas ser visualizado" }, { status: 409 });
    }

    const ct = request.headers.get("content-type") || "";
    if (!ct.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Envie multipart/form-data" }, { status: 400 });
    }

    const form = await request.formData();
    const files = form.getAll("files").filter((item): item is File => item instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }

    const dir = getFinancialTitleExpenseAttachmentDir(id, expenseItemId);
    await mkdir(dir, { recursive: true });

    const items: Array<{
      id: number;
      originalFileName: string;
      mimeType: string | null;
      sizeBytes: number | null;
      createdAt: Date;
      createdBy: { id: number; name: string; abbrevName: string | null };
    }> = [];
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (buffer.length === 0) continue;
      if (buffer.length > 50 * 1024 * 1024) {
        return NextResponse.json({ error: `O arquivo ${file.name} excede 50MB` }, { status: 400 });
      }

      const safeName = sanitizeFinancialAttachmentFileName(file.name || "arquivo");
      const storedFileName = `financial-title-expense-${expenseItemId}-${Date.now()}-${randomUUID()}-${safeName}`;
      await writeFile(path.join(dir, storedFileName), buffer);

      const created = await prisma.financialTitleExpenseAttachment.create({
        data: {
          financialTitleExpenseId: expenseItemId,
          createdById: Math.trunc(userId),
          storedFileName,
          originalFileName: file.name || storedFileName,
          mimeType: file.type || null,
          sizeBytes: buffer.length,
        },
        select: {
          id: true,
          originalFileName: true,
          mimeType: true,
          sizeBytes: true,
          createdAt: true,
          createdBy: { select: { id: true, name: true, abbrevName: true } },
        },
      });

      items.push(created);
    }

    return NextResponse.json({ ok: true, items }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}
