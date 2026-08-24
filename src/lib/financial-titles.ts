import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { prisma } from "./prisma";
import path from "path";

export const FINANCIAL_TITLE_KIND = {
  RECEBER: "RECEBER",
  PAGAR: "PAGAR",
} as const;

export const FINANCIAL_TITLE_STATUS = {
  ABERTO: "ABERTO",
  PAGO: "PAGO",
} as const;

export type FinancialTitleKind = (typeof FINANCIAL_TITLE_KIND)[keyof typeof FINANCIAL_TITLE_KIND];
export type FinancialTitleStatus = (typeof FINANCIAL_TITLE_STATUS)[keyof typeof FINANCIAL_TITLE_STATUS];

export async function ensureFinancialTitleTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`financialtitle\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`entityId\` INT NOT NULL,
      \`createdByUserId\` INT NULL,
      \`reimbursementTypeId\` INT NULL,
      \`kind\` VARCHAR(20) NOT NULL,
      \`numero\` VARCHAR(30) NOT NULL,
      \`dueDate\` DATETIME(3) NOT NULL,
      \`amount\` DOUBLE NOT NULL,
      \`status\` VARCHAR(20) NOT NULL DEFAULT 'ABERTO',
      \`integrated\` TINYINT(1) NOT NULL DEFAULT 0,
      \`description\` VARCHAR(255) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`financialtitle_entity_numero_key\` (\`entityId\`, \`numero\`),
      KEY \`financialtitle_entity_kind_due_idx\` (\`entityId\`, \`kind\`, \`dueDate\`),
      KEY \`financialtitle_entity_status_idx\` (\`entityId\`, \`status\`),
      KEY \`financialtitle_created_by_idx\` (\`createdByUserId\`),
      KEY \`financialtitle_reimbursement_idx\` (\`reimbursementTypeId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE \`financialtitle\`
    ADD COLUMN IF NOT EXISTS \`createdByUserId\` INT NULL AFTER \`entityId\`
  `);
}

export async function ensureFinancialTitleAttachmentTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`financialtitleattachment\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`financialTitleId\` INT NOT NULL,
      \`createdById\` INT NOT NULL,
      \`storedFileName\` VARCHAR(255) NOT NULL,
      \`originalFileName\` VARCHAR(255) NOT NULL,
      \`mimeType\` VARCHAR(191) NULL,
      \`sizeBytes\` INT NULL,
      \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`financialtitleattachment_title_idx\` (\`financialTitleId\`),
      KEY \`financialtitleattachment_createdby_idx\` (\`createdById\`),
      CONSTRAINT \`financialtitleattachment_title_fk\` FOREIGN KEY (\`financialTitleId\`) REFERENCES \`financialtitle\`(\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`financialtitleattachment_createdby_fk\` FOREIGN KEY (\`createdById\`) REFERENCES \`user\`(\`id\`) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

export async function resolveActiveEntityId() {
  const session = await getServerSession(authOptions);
  const userId = session?.user ? Number((session.user as any).id) : null;
  if (!userId || !Number.isFinite(userId) || userId <= 0) {
    return { userId: null, entityId: null };
  }

  const sessionEntityIdRaw = (session as any)?.activeEntityId ?? (session as any)?.entityId ?? null;
  const sessionEntityId = sessionEntityIdRaw == null ? null : Number(sessionEntityIdRaw);
  if (sessionEntityId && Number.isFinite(sessionEntityId) && sessionEntityId > 0) {
    return { userId: Math.trunc(userId), entityId: Math.trunc(sessionEntityId) };
  }

  const user = await prisma.user.findUnique({
    where: { id: Math.trunc(userId) },
    select: { lastEntityId: true },
  });

  const entityId = user?.lastEntityId ? Number(user.lastEntityId) : null;
  return {
    userId: Math.trunc(userId),
    entityId: entityId && Number.isFinite(entityId) && entityId > 0 ? Math.trunc(entityId) : null,
  };
}

export function parsePositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

export function sanitizeFinancialAttachmentFileName(fileName: string) {
  return String(fileName || "arquivo").replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function getFinancialTitleAttachmentDir(financialTitleId: number) {
  return path.join(process.cwd(), "storage", "meu-financeiro", "reembolsos", String(financialTitleId), "attachments");
}

export function normalizeFinancialTitleKind(value: unknown): FinancialTitleKind | null {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === FINANCIAL_TITLE_KIND.RECEBER || normalized === FINANCIAL_TITLE_KIND.PAGAR) {
    return normalized;
  }
  return null;
}

export function normalizeFinancialTitleStatus(value: unknown): FinancialTitleStatus | null {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === FINANCIAL_TITLE_STATUS.ABERTO || normalized === FINANCIAL_TITLE_STATUS.PAGO) {
    return normalized;
  }
  return null;
}

export function parseFinancialAmount(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : NaN;
  }

  const raw = String(value || "").trim();
  if (!raw) return NaN;

  const normalized = raw.replace(/\s+/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function normalizeDueDate(value: unknown): Date | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export async function generateFinancialTitleNumber(entityId: number, kind: FinancialTitleKind) {
  const now = new Date();
  const year = now.getFullYear();
  const prefix = kind === FINANCIAL_TITLE_KIND.RECEBER ? "REC" : "RMB";
  const base = `${prefix}/${year}/`;
  const latest = await prisma.financialTitle.findFirst({
    where: {
      entityId: Math.trunc(entityId),
      kind,
      numero: { startsWith: base },
    },
    orderBy: { numero: "desc" },
    select: { numero: true },
  });

  const lastSequence = latest?.numero ? Number(String(latest.numero).slice(base.length)) : 0;
  const nextSequence = Number.isFinite(lastSequence) ? lastSequence + 1 : 1;

  return `${base}${String(nextSequence).padStart(4, "0")}`;
}
