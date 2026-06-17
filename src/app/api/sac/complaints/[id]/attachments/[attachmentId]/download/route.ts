import { NextResponse } from 'next/server';
import { prisma } from '../../../../../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../../../../lib/auth';
import { readFile } from 'fs/promises';
import path from 'path';

function toPositiveInt(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
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

export async function GET(_: Request, props: { params: Promise<{ id: string; attachmentId: string }> }) {
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

    const att = await prisma.complaintAttachment.findUnique({ where: { id: attachmentId } });
    if (!att || att.complaintId !== complaintId) return NextResponse.json({ error: 'Anexo não encontrado' }, { status: 404 });

    const dir = storageDirForComplaint(complaintId);
    const filePath = path.join(dir, att.storedFileName);
    const buffer = await readFile(filePath).catch(() => null);
    if (!buffer) return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });

    const res = new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': att.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(att.originalFileName || 'arquivo')}"`,
        'Cache-Control': 'no-store',
      },
    });
    return res;
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

