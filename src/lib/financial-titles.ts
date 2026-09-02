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
      \`dueDate\` DATETIME(3) NULL,
      \`amount\` DOUBLE NOT NULL,
      \`status\` VARCHAR(20) NOT NULL DEFAULT 'ABERTO',
      \`integrated\` TINYINT(1) NOT NULL DEFAULT 0,
      \`description\` VARCHAR(255) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`financialtitle_entity_user_numero_key\` (\`entityId\`, \`createdByUserId\`, \`numero\`),
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

  await prisma.$executeRawUnsafe(`
    ALTER TABLE \`financialtitle\`
    MODIFY COLUMN \`dueDate\` DATETIME(3) NULL
  `);

  const indexes = (await prisma.$queryRawUnsafe(`
    SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX, NON_UNIQUE
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'financialtitle'
      AND INDEX_NAME IN ('financialtitle_entity_numero_key', 'financialtitle_entity_user_numero_key')
    ORDER BY INDEX_NAME, SEQ_IN_INDEX
  `)) as Array<{ INDEX_NAME?: string; COLUMN_NAME?: string; NON_UNIQUE?: number }>;

  const uniqueIndexes = new Map<string, string[]>();
  for (const row of indexes) {
    if (Number(row?.NON_UNIQUE || 0) !== 0) continue;
    const indexName = String(row?.INDEX_NAME || "").trim();
    const columnName = String(row?.COLUMN_NAME || "").trim();
    if (!indexName || !columnName) continue;
    uniqueIndexes.set(indexName, [...(uniqueIndexes.get(indexName) || []), columnName]);
  }

  const hasNewUniqueKey = JSON.stringify(uniqueIndexes.get("financialtitle_entity_user_numero_key") || []) === JSON.stringify([
    "entityId",
    "createdByUserId",
    "numero",
  ]);

  if (!hasNewUniqueKey) {
    const hasOldUniqueKey = uniqueIndexes.has("financialtitle_entity_numero_key");
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`financialtitle\`
      ${hasOldUniqueKey ? "DROP INDEX `financialtitle_entity_numero_key`," : ""}
      ADD UNIQUE KEY \`financialtitle_entity_user_numero_key\` (\`entityId\`, \`createdByUserId\`, \`numero\`)
    `);
  }
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

export async function ensureFinancialTitleExpenseTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`financialtitleexpense\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`financialTitleId\` INT NOT NULL,
      \`reimbursementTypeId\` INT NOT NULL,
      \`description\` VARCHAR(255) NOT NULL,
      \`amount\` DOUBLE NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      KEY \`financialtitleexpense_title_idx\` (\`financialTitleId\`),
      KEY \`financialtitleexpense_reimbursement_idx\` (\`reimbursementTypeId\`),
      CONSTRAINT \`financialtitleexpense_title_fk\` FOREIGN KEY (\`financialTitleId\`) REFERENCES \`financialtitle\`(\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`financialtitleexpense_reimbursement_fk\` FOREIGN KEY (\`reimbursementTypeId\`) REFERENCES \`reimbursementtype\`(\`id\`) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Backfill legacy reimbursements so existing titles remain editable in the new UI.
  await prisma.$executeRawUnsafe(`
    INSERT INTO \`financialtitleexpense\` (\`financialTitleId\`, \`reimbursementTypeId\`, \`description\`, \`amount\`, \`createdAt\`, \`updatedAt\`)
    SELECT
      ft.\`id\`,
      ft.\`reimbursementTypeId\`,
      COALESCE(NULLIF(TRIM(ft.\`description\`), ''), CONCAT('Reembolso ', ft.\`numero\`)),
      ft.\`amount\`,
      ft.\`createdAt\`,
      ft.\`updatedAt\`
    FROM \`financialtitle\` ft
    WHERE ft.\`reimbursementTypeId\` IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM \`financialtitleexpense\` fte
        WHERE fte.\`financialTitleId\` = ft.\`id\`
      )
  `);
}

export async function ensureFinancialTitleExpenseAttachmentTable() {
  await ensureFinancialTitleAttachmentTable();

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`financialtitleexpenseattachment\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`financialTitleExpenseId\` INT NOT NULL,
      \`createdById\` INT NOT NULL,
      \`storedFileName\` VARCHAR(255) NOT NULL,
      \`originalFileName\` VARCHAR(255) NOT NULL,
      \`mimeType\` VARCHAR(191) NULL,
      \`sizeBytes\` INT NULL,
      \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`financialtitleexpenseattachment_expense_idx\` (\`financialTitleExpenseId\`),
      KEY \`financialtitleexpenseattachment_createdby_idx\` (\`createdById\`),
      CONSTRAINT \`financialtitleexpenseattachment_expense_fk\` FOREIGN KEY (\`financialTitleExpenseId\`) REFERENCES \`financialtitleexpense\`(\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`financialtitleexpenseattachment_createdby_fk\` FOREIGN KEY (\`createdById\`) REFERENCES \`user\`(\`id\`) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Move legacy title attachments to the first expense line of each reimbursement.
  await prisma.$executeRawUnsafe(`
    INSERT INTO \`financialtitleexpenseattachment\` (\`financialTitleExpenseId\`, \`createdById\`, \`storedFileName\`, \`originalFileName\`, \`mimeType\`, \`sizeBytes\`, \`createdAt\`, \`updatedAt\`)
    SELECT
      expense_map.\`expenseId\`,
      legacy.\`createdById\`,
      legacy.\`storedFileName\`,
      legacy.\`originalFileName\`,
      legacy.\`mimeType\`,
      legacy.\`sizeBytes\`,
      legacy.\`createdAt\`,
      legacy.\`updatedAt\`
    FROM \`financialtitleattachment\` legacy
    INNER JOIN (
      SELECT \`financialTitleId\`, MIN(\`id\`) AS \`expenseId\`
      FROM \`financialtitleexpense\`
      GROUP BY \`financialTitleId\`
    ) expense_map
      ON expense_map.\`financialTitleId\` = legacy.\`financialTitleId\`
    WHERE NOT EXISTS (
      SELECT 1
      FROM \`financialtitleexpenseattachment\` new_att
      WHERE new_att.\`financialTitleExpenseId\` = expense_map.\`expenseId\`
        AND new_att.\`storedFileName\` = legacy.\`storedFileName\`
    )
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

export function getFinancialTitleExpenseAttachmentDir(financialTitleId: number, financialTitleExpenseId: number) {
  return path.join(
    process.cwd(),
    "storage",
    "meu-financeiro",
    "reembolsos",
    String(financialTitleId),
    "expenses",
    String(financialTitleExpenseId),
    "attachments"
  );
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

export function calculateDefaultFinancialTitleDueDate(referenceDate = new Date()) {
  const baseDate = new Date(referenceDate);
  baseDate.setHours(0, 0, 0, 0);

  // Progress ABL WEEKDAY returns 1 for Sunday through 7 for Saturday.
  const progressWeekday = baseDate.getDay() + 1;
  const daysToAdd = progressWeekday <= 3 ? 5 - progressWeekday : 12 - progressWeekday;

  const result = new Date(baseDate);
  result.setDate(result.getDate() + daysToAdd);
  return result;
}

export type FinancialExpenseItemInput = {
  id?: number | null;
  clientKey?: string | null;
  reimbursementTypeId: number;
  description: string;
  amount: number;
};

export function buildFinancialTitleSummary(expenseItems: FinancialExpenseItemInput[]) {
  const normalized = expenseItems.filter((item) => item && Number.isFinite(item.amount) && item.amount > 0);
  const totalAmount = normalized.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const reimbursementTypeId =
    normalized.length === 1 && Number.isFinite(normalized[0].reimbursementTypeId) ? Math.trunc(normalized[0].reimbursementTypeId) : null;
  const description =
    normalized.length === 0
      ? null
      : normalized.length === 1
        ? String(normalized[0].description || "").trim() || null
        : `${normalized.length} despesas vinculadas ao reembolso`;

  return {
    amount: totalAmount,
    reimbursementTypeId,
    description,
  };
}

export async function generateFinancialTitleNumber(entityId: number, createdByUserId: number, referenceDate = new Date()) {
  const now = new Date(referenceDate);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const base = `${year}${month}/`;
  const monthStart = new Date(year, now.getMonth(), 1);
  const nextMonthStart = new Date(year, now.getMonth() + 1, 1);

  const existing = await prisma.financialTitle.findMany({
    where: {
      entityId: Math.trunc(entityId),
      createdByUserId: Math.trunc(createdByUserId),
      createdAt: {
        gte: monthStart,
        lt: nextMonthStart,
      },
      numero: { startsWith: base },
    },
    select: { numero: true },
  });

  const lastSequence = existing.reduce((maxValue, row) => {
    const current = Number.parseInt(String(row.numero || "").slice(base.length), 10);
    return Number.isFinite(current) && current > maxValue ? current : maxValue;
  }, 0);
  const nextSequence = lastSequence + 1;

  return `${base}${String(nextSequence).padStart(2, "0")}`;
}
