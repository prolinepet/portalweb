import { NextResponse } from 'next/server';
import { prisma } from '../../../../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../../../lib/auth';
import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import path from 'path';

function toPositiveInt(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function sanitizeFileName(fileName: string): string {
  return (fileName || 'arquivo').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function storageDirForComplaint(complaintId: number): string {
  return path.join(process.cwd(), 'storage', 'sac', 'complaints', String(complaintId), 'attachments');
}

async function ensureComplaintAttachmentsTable(): Promise<void> {
  const g = global as any;
  if (g.__complaintAttachmentsEnsured) return;

  try {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS \`complaintattachment\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`complaintId\` INT NOT NULL,
        \`description\` VARCHAR(255) NOT NULL,
        \`storedFileName\` VARCHAR(255) NOT NULL,
        \`originalFileName\` VARCHAR(255) NOT NULL,
        \`mimeType\` VARCHAR(191) NULL,
        \`sizeBytes\` INT NULL,
        \`createdById\` INT NOT NULL,
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`complaintattachment_complaint_idx\` (\`complaintId\`),
        KEY \`complaintattachment_createdby_idx\` (\`createdById\`),
        CONSTRAINT \`complaintattachment_complaint_fk\` FOREIGN KEY (\`complaintId\`) REFERENCES \`complaint\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`complaintattachment_createdby_fk\` FOREIGN KEY (\`createdById\`) REFERENCES \`user\`(\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
    );
  } catch {}

  g.__complaintAttachmentsEnsured = true;
}

export async function PUT(request: Request, props: { params: Promise<{ id: string; attachmentId: string }> }) {
  const params = await props.params;
  try {
    await ensureComplaintAttachmentsTable();
    const session = await getServerSession(authOptions);
    const uid = session?.user ? Number((session.user as any).id) : null;
    if (!uid) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const complaintId = toPositiveInt(params.id);
    const attachmentId = toPositiveInt(params.attachmentId);
    if (!complaintId) return NextResponse.json({ error: 'Reclamação inválida' }, { status: 400 });
    if (!attachmentId) return NextResponse.json({ error: 'Anexo inválido' }, { status: 400 });

    const ct = request.headers.get('content-type') || '';
    if (!ct.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Envie multipart/form-data' }, { status: 400 });
    }

    const existing = await prisma.complaintAttachment.findUnique({ where: { id: attachmentId } });
    if (!existing || existing.complaintId !== complaintId) return NextResponse.json({ error: 'Anexo não encontrado' }, { status: 404 });

    const form = await request.formData();
    const description = String(form.get('description') || '').trim();
    const file = form.get('file') as File | null;
    if (!description) return NextResponse.json({ error: 'Descrição é obrigatória' }, { status: 400 });

    let storedFileName = existing.storedFileName;
    let originalFileName = existing.originalFileName;
    let mimeType = existing.mimeType;
    let sizeBytes = existing.sizeBytes;

    if (file) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (buffer.length > 50 * 1024 * 1024) return NextResponse.json({ error: 'Arquivo excede 50MB' }, { status: 400 });
      const dir = storageDirForComplaint(complaintId);
      await mkdir(dir, { recursive: true });
      const safeName = sanitizeFileName(file.name || 'arquivo');
      storedFileName = `complaint-${complaintId}-${Date.now()}-${randomUUID()}-${safeName}`;
      const filePath = path.join(dir, storedFileName);
      await writeFile(filePath, buffer);

      const oldPath = path.join(dir, existing.storedFileName);
      await unlink(oldPath).catch(() => {});

      originalFileName = file.name || storedFileName;
      mimeType = file.type || null;
      sizeBytes = buffer.length;
    }

    const updated = await prisma.complaintAttachment.update({
      where: { id: attachmentId },
      data: { description, storedFileName, originalFileName, mimeType, sizeBytes },
      select: {
        id: true,
        description: true,
        originalFileName: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true, abbrevName: true } },
      },
    });

    return NextResponse.json({ ok: true, item: updated });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}

export async function DELETE(_: Request, props: { params: Promise<{ id: string; attachmentId: string }> }) {
  const params = await props.params;
  try {
    await ensureComplaintAttachmentsTable();
    const session = await getServerSession(authOptions);
    const uid = session?.user ? Number((session.user as any).id) : null;
    if (!uid) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const complaintId = toPositiveInt(params.id);
    const attachmentId = toPositiveInt(params.attachmentId);
    if (!complaintId) return NextResponse.json({ error: 'Reclamação inválida' }, { status: 400 });
    if (!attachmentId) return NextResponse.json({ error: 'Anexo inválido' }, { status: 400 });

    const existing = await prisma.complaintAttachment.findUnique({ where: { id: attachmentId } });
    if (!existing || existing.complaintId !== complaintId) return NextResponse.json({ error: 'Anexo não encontrado' }, { status: 404 });

    const dir = storageDirForComplaint(complaintId);
    const filePath = path.join(dir, existing.storedFileName);
    await unlink(filePath).catch(() => {});

    await prisma.complaintAttachment.delete({ where: { id: attachmentId } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}
