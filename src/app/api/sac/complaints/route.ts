import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';

async function ensureComplaintWorkflowColumns(): Promise<void> {
  const g = global as any;
  if (g.__complaintWorkflowColumnsEnsured) return;

  try {
    await prisma.$executeRawUnsafe('ALTER TABLE `complaint` ADD COLUMN `occurrenceDate` DATETIME NULL;');
  } catch {}
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE `complaint` ADD COLUMN `sacSgqProcessId` INT NULL;');
  } catch {}
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE `complaint` ADD COLUMN `sacSgqPhaseId` INT NULL;');
  } catch {}
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE `complaint` ADD COLUMN `responsibleUserId` INT NULL;');
  } catch {}
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE `complaint` ADD COLUMN `previousUserId` INT NULL;');
  } catch {}
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE `complaint` ADD COLUMN `nextUserId` INT NULL;');
  } catch {}
  try {
    await prisma.$executeRawUnsafe('CREATE INDEX `complaint_sacsgq_process_phase_idx` ON `complaint` (`sacSgqProcessId`, `sacSgqPhaseId`);');
  } catch {}
  try {
    await prisma.$executeRawUnsafe('CREATE INDEX `complaint_responsible_user_idx` ON `complaint` (`responsibleUserId`);');
  } catch {}

  g.__complaintWorkflowColumnsEnsured = true;
}

function toDateOrNull(v: any): Date | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toPositiveIntOrNull(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

async function resolveComplaintWorkflow(body: any) {
  const processId = toPositiveIntOrNull(body?.sacSgqProcessId);
  if (!processId) {
    return {
      sacSgqProcessId: null,
      sacSgqPhaseId: null,
      phase: null,
      responsibleUserId: null,
      previousUserId: null,
      nextUserId: null,
    };
  }

  const process = await prisma.sacSgqProcess.findUnique({
    where: { id: processId },
    include: {
      phases: {
        orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
        include: {
          users: {
            orderBy: [{ tagCode: 'asc' }, { sequence: 'asc' }, { id: 'asc' }],
            select: { id: true, userId: true },
          },
        },
      },
    },
  });

  const firstPhase = process?.phases?.[0] ?? null;
  const orderedUsers = Array.isArray(firstPhase?.users) ? firstPhase.users : [];

  if (!process || !firstPhase) {
    return {
      sacSgqProcessId: processId,
      sacSgqPhaseId: null,
      phase: null,
      responsibleUserId: null,
      previousUserId: null,
      nextUserId: null,
    };
  }

  const requestedResponsibleId = toPositiveIntOrNull(body?.responsibleUserId);
  let currentIndex = orderedUsers.findIndex((item) => item.userId === requestedResponsibleId);
  if (currentIndex < 0) currentIndex = orderedUsers.length > 0 ? 0 : -1;

  const currentUser = currentIndex >= 0 ? orderedUsers[currentIndex] : null;
  const previousUser = currentIndex > 0 ? orderedUsers[currentIndex - 1] : null;
  const requestedNextId = toPositiveIntOrNull(body?.nextUserId);
  const nextCandidates = currentIndex >= 0 ? orderedUsers.slice(currentIndex + 1) : [];
  const nextUser =
    nextCandidates.find((item) => item.userId === requestedNextId) ??
    nextCandidates[0] ??
    null;

  return {
    sacSgqProcessId: process.id,
    sacSgqPhaseId: firstPhase.id,
    phase: firstPhase.description,
    responsibleUserId: currentUser?.userId ?? null,
    previousUserId: previousUser?.userId ?? null,
    nextUserId: nextUser?.userId ?? null,
  };
}

export async function POST(request: Request) {
  try {
    await ensureComplaintWorkflowColumns();
    const session = await getServerSession(authOptions);
    const uid = session?.user ? Number((session.user as any).id) : undefined;
    const activeEntityId = (session as any)?.activeEntityId ?? null;
    if (!uid) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    if (!activeEntityId) return NextResponse.json({ error: 'Entidade ativa não definida' }, { status: 400 });

    const body: any = await request.json().catch(() => ({}));
    const items = Array.isArray(body.items) ? body.items : [];
    const workflow = await resolveComplaintWorkflow(body);
    const occurrenceDate = toDateOrNull(body.occurrenceDate);
    const created = await prisma.complaint.create({
      data: {
        code: body.code ? String(body.code) : null,
        entityId: Number(activeEntityId),
        createdById: uid,
        division: body.division ? String(body.division) : null,
        type: body.type ? String(body.type) : null,
        occurrenceDate,
        sacSgqProcessId: workflow.sacSgqProcessId,
        sacSgqPhaseId: workflow.sacSgqPhaseId,
        responsibleUserId: workflow.responsibleUserId,
        previousUserId: workflow.previousUserId,
        nextUserId: workflow.nextUserId,
        phase: workflow.phase,
        dueDate: toDateOrNull(body.dueDate),
        canceled: Boolean(body.canceled),
        cancelReason: body.cancelReason ? String(body.cancelReason) : null,
        dateSac: occurrenceDate ?? toDateOrNull(body.dateSac),
        dateReceived: toDateOrNull(body.dateReceived),
        counterpartyType: body.counterpartyType ? String(body.counterpartyType) : null,
        counterpartyCode: body.counterpartyCode ? String(body.counterpartyCode) : null,
        counterpartyName: body.counterpartyName ? String(body.counterpartyName) : null,
        city: body.city ? String(body.city) : null,
        uf: body.uf ? String(body.uf) : null,
        contactName: body.contactName ? String(body.contactName) : null,
        contactPhone: body.contactPhone ? String(body.contactPhone) : null,
        contactEmail: body.contactEmail ? String(body.contactEmail) : null,
        representativeName: body.representativeName ? String(body.representativeName) : null,
        representativeEmail: body.representativeEmail ? String(body.representativeEmail) : null,
        carrier: body.carrier ? String(body.carrier) : null,
        freightType: body.freightType ? String(body.freightType) : null,
        attendant: body.attendant ? String(body.attendant) : null,
        reference: body.reference ? String(body.reference) : null,
        classification: body.classification ? String(body.classification) : null,
        occurrencePattern: body.occurrencePattern ? String(body.occurrencePattern) : null,
        occurrenceCode: body.occurrenceCode ? String(body.occurrenceCode) : null,
        occurrenceText: body.occurrenceText ? String(body.occurrenceText) : null,
        items: items.length
          ? {
              createMany: {
                data: items.map((it: any) => ({
                  invoiceNumber: it.invoiceNumber ? String(it.invoiceNumber) : null,
                  sft: it.sft ? String(it.sft) : null,
                  orderNumber: it.orderNumber ? String(it.orderNumber) : null,
                  spd: it.spd ? String(it.spd) : null,
                  emissionDate: toDateOrNull(it.emissionDate),
                  description: it.description ? String(it.description) : null,
                  uom: it.uom ? String(it.uom) : null,
                  unitPrice: Number(it.unitPrice ?? 0),
                  qtyInvoiced: Number(it.qtyInvoiced ?? 0),
                  divergenceQty: Number(it.divergenceQty ?? 0),
                  divergenceValue: Number(it.divergenceValue ?? 0),
                  divergencePercent: Number(it.divergencePercent ?? 0),
                  totalPercent: Number(it.totalPercent ?? 0),
                })),
              },
            }
          : undefined,
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, id: created.id });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}

export async function GET() {
  try {
    await ensureComplaintWorkflowColumns();
    const complaints = await prisma.complaint.findMany({
      take: 100,
      orderBy: { id: 'desc' },
      select: {
        id: true,
        code: true,
        counterpartyName: true,
        division: true,
        type: true,
        phase: true,
        dateSac: true,
        dateReceived: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ ok: true, complaints });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}
