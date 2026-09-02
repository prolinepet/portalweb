import { readFile } from "fs/promises";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import path from "path";
import { authOptions } from "@/lib/auth";
import {
  ensureFinancialTitleExpenseAttachmentTable,
  ensureFinancialTitleExpenseTable,
  ensureFinancialTitleTable,
  getFinancialTitleExpenseAttachmentDir,
  parsePositiveInt,
  resolveActiveEntityId,
} from "@/lib/financial-titles";
import { prisma } from "@/lib/prisma";

export async function GET(
  _: Request,
  props: { params: Promise<{ id: string; expenseItemId: string; attachmentId: string }> }
) {
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
    const attachmentId = parsePositiveInt(params.attachmentId);
    if (!id || !expenseItemId || !attachmentId) {
      return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
    }

    const attachment = await prisma.financialTitleExpenseAttachment.findUnique({
      where: { id: attachmentId },
      include: {
        financialTitleExpense: {
          select: {
            id: true,
            financialTitleId: true,
            financialTitle: { select: { entityId: true } },
          },
        },
      },
    });
    if (
      !attachment ||
      attachment.financialTitleExpenseId !== expenseItemId ||
      attachment.financialTitleExpense.financialTitleId !== id ||
      attachment.financialTitleExpense.financialTitle.entityId !== entityId
    ) {
      return NextResponse.json({ error: "Anexo não encontrado" }, { status: 404 });
    }

    const filePath = path.join(getFinancialTitleExpenseAttachmentDir(id, expenseItemId), attachment.storedFileName);
    const buffer = await readFile(filePath).catch(() => null);
    if (!buffer) {
      return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": attachment.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(attachment.originalFileName || "arquivo")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
