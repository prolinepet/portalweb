import { prisma } from "./prisma";

type CampaignOrderItem = {
  quantity?: number | null;
  unitPrice?: number | null;
  discountPct?: number | null;
  discountValue?: number | null;
  width?: number | null;
  length?: number | null;
  grammage?: number | null;
  sku?: string | null;
  inventoryItem?: {
    id: number;
    unitWeightKg?: number | null;
    commercialFamilyId?: number | null;
    commercialFamily?: {
      id: number;
      erpCode?: string | null;
      priceBy?: string | null;
    } | null;
  } | null;
};

type CampaignOrder = {
  customerDoc?: string | null;
  paymentTerms?: string | null;
  clientId?: number | null;
  orderTypeId?: number | null;
  createdBy?: { doc?: string | null } | null;
  orderType?: { codtipoped?: number | null } | null;
  items?: CampaignOrderItem[];
};

type CampaignRow = {
  campaignCode: string;
  campaignDescription: string;
  active: boolean;
  customerDocInitial?: string | null;
  customerDocFinal?: string | null;
  representativeDocInitial?: string | null;
  representativeDocFinal?: string | null;
  orderTypeCodeInitial?: string | null;
  orderTypeCodeFinal?: string | null;
  priceTableCodeInitial?: string | null;
  priceTableCodeFinal?: string | null;
  commercialFamilyCodeInitial?: string | null;
  commercialFamilyCodeFinal?: string | null;
  itemCodeInitial?: string | null;
  itemCodeFinal?: string | null;
  paymentConditionCodeInitial?: string | null;
  paymentConditionCodeFinal?: string | null;
  quantityInitial?: number | null;
  quantityFinal?: number | null;
  valueInitial?: number | null;
  valueFinal?: number | null;
  weightInitial?: number | null;
  weightFinal?: number | null;
  discountType: number;
  discountTypeValue: number;
};

export type PromotionalCampaignResult = {
  campaignCode: string;
  campaignDescription: string;
  eligibleQuantity: number;
  bonusValue: number;
  eligibleValue: number;
  eligibleWeight: number;
  discountType: number;
  discountTypeValue: number;
};

function normalizeDigits(value: unknown): string {
  return String(value ?? "").replace(/\D+/g, "");
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeNumericString(value: unknown): string {
  const raw = String(value ?? "").trim().replace(",", ".");
  if (!raw) return "";
  const sign = raw.startsWith("-") ? "-" : "";
  const unsigned = raw.replace(/^[+-]/, "");
  const parts = unsigned.split(".");
  const intPart = (parts[0] || "").replace(/^0+(?=\d)/, "") || "0";
  const decimalPart = parts.length > 1 ? parts.slice(1).join("").replace(/0+$/, "") : "";
  return decimalPart ? `${sign}${intPart}.${decimalPart}` : `${sign}${intPart}`;
}

function isNumericLike(value: string): boolean {
  return /^-?\d+(?:\.\d+)?$/.test(value);
}

function compareMixed(candidate: string, bound: string): number {
  if (isNumericLike(candidate) && isNumericLike(bound)) {
    const [candidateInt, candidateFrac = ""] = candidate.replace("-", "").split(".");
    const [boundInt, boundFrac = ""] = bound.replace("-", "").split(".");
    const candidateNegative = candidate.startsWith("-");
    const boundNegative = bound.startsWith("-");
    if (candidateNegative !== boundNegative) {
      return candidateNegative ? -1 : 1;
    }
    const sameSignFactor = candidateNegative ? -1 : 1;
    if (candidateInt.length !== boundInt.length) {
      return candidateInt.length > boundInt.length ? sameSignFactor : -sameSignFactor;
    }
    if (candidateInt !== boundInt) {
      return candidateInt > boundInt ? sameSignFactor : -sameSignFactor;
    }
    const fracLength = Math.max(candidateFrac.length, boundFrac.length);
    const candidateFracNormalized = candidateFrac.padEnd(fracLength, "0");
    const boundFracNormalized = boundFrac.padEnd(fracLength, "0");
    if (candidateFracNormalized === boundFracNormalized) return 0;
    return candidateFracNormalized > boundFracNormalized ? sameSignFactor : -sameSignFactor;
  }
  return candidate.localeCompare(bound, "pt-BR", { sensitivity: "base" });
}

function isWithinRange(candidateRaw: unknown, initialRaw: unknown, finalRaw: unknown, mode: "digits" | "text" | "mixed"): boolean {
  const candidate =
    mode === "digits"
      ? normalizeDigits(candidateRaw)
      : mode === "mixed"
      ? normalizeNumericString(candidateRaw)
      : normalizeText(candidateRaw);
  const initial =
    mode === "digits"
      ? normalizeDigits(initialRaw)
      : mode === "mixed"
      ? normalizeNumericString(initialRaw)
      : normalizeText(initialRaw);
  const final =
    mode === "digits"
      ? normalizeDigits(finalRaw)
      : mode === "mixed"
      ? normalizeNumericString(finalRaw)
      : normalizeText(finalRaw);

  if (!candidate) return !initial && !final;
  if (initial && compareMixed(candidate, initial) < 0) return false;
  if (final && compareMixed(candidate, final) > 0) return false;
  return true;
}

function extractPaymentConditionCode(paymentTerms: string | null | undefined): string {
  const raw = String(paymentTerms ?? "").trim();
  const match = raw.match(/\[(\d+)\]/);
  if (match?.[1]) return match[1];
  return normalizeText(raw);
}

function computeWeightKg(item: CampaignOrderItem): number {
  const unitWeight = Number(item.inventoryItem?.unitWeightKg ?? 0);
  const quantity = Number(item.quantity ?? 0);
  if (Number.isFinite(unitWeight) && unitWeight > 0 && Number.isFinite(quantity) && quantity > 0) {
    return unitWeight * quantity;
  }

  const width = Number(item.width ?? 0);
  const length = Number(item.length ?? 0);
  const grammage = Number(item.grammage ?? 0);
  if (width > 0 && length > 0 && grammage > 0 && quantity > 0) {
    const areaM2 = (length / 1000) * (width / 1000);
    return (areaM2 * grammage * quantity) / 1000;
  }
  return 0;
}

function familyPriceBy(item: CampaignOrderItem): "UNIT" | "WEIGHT" {
  const priceBy = normalizeText(item.inventoryItem?.commercialFamily?.priceBy);
  return priceBy === "WEIGHT" || priceBy === "PESO" ? "WEIGHT" : "UNIT";
}

function computeEligibleValue(item: CampaignOrderItem): number {
  const quantity = Number(item.quantity ?? 0);
  const unitPrice = Number(item.unitPrice ?? 0);
  const base = familyPriceBy(item) === "WEIGHT" ? computeWeightKg(item) * unitPrice : quantity * unitPrice;
  const pct = Number(item.discountPct ?? 0);
  const discountValue = Number(item.discountValue ?? 0);
  const unitFactor = familyPriceBy(item) === "WEIGHT" ? computeWeightKg(item) : quantity;
  return Math.max(0, base - (base * pct) / 100 - unitFactor * discountValue);
}

function computeEligibleQuantity(item: CampaignOrderItem): number {
  const quantity = Number(item.quantity ?? 0);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
}

async function resolvePriceTableCodesByInventoryItem(
  clientId: number | null | undefined,
  orderTypeId: number | null | undefined,
  items: CampaignOrderItem[],
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!clientId || !orderTypeId) return out;

  const inventoryItemIds = Array.from(
    new Set(
      items
        .map((item) => Number(item.inventoryItem?.id ?? 0))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  );
  if (!inventoryItemIds.length) return out;

  const [clientLinks, typeLinks] = await Promise.all([
    prisma.clientPriceTable.findMany({
      where: { clientId: Math.trunc(clientId) },
      select: { priceTableId: true },
    }),
    prisma.orderTypePriceTable.findMany({
      where: { orderTypeId: Math.trunc(orderTypeId) },
      select: { priceTableId: true },
    }),
  ]);

  const clientPriceTableIds = new Set(clientLinks.map((row) => Number(row.priceTableId)));
  const allowedPriceTableIds = Array.from(
    new Set(typeLinks.map((row) => Number(row.priceTableId)).filter((id) => clientPriceTableIds.has(id))),
  ).filter((id) => Number.isFinite(id) && id > 0);

  if (!allowedPriceTableIds.length) return out;

  const rows = await prisma.priceTableItem.findMany({
    where: {
      priceTableId: { in: allowedPriceTableIds },
      inventoryItemId: { in: inventoryItemIds.map((id) => Math.trunc(id)) },
      priceTable: { situacao: 1 },
    },
    select: {
      inventoryItemId: true,
      priceTableId: true,
      unitPrice: true,
      priceTable: { select: { nrtabpre: true } },
    },
  });

  const bestByInventoryItem = new Map<number, { unitPrice: number; priceTableId: number; priceTableCode: string }>();
  for (const row of rows) {
    const inventoryItemId = Number(row.inventoryItemId ?? 0);
    const unitPrice = Number(row.unitPrice ?? 0);
    const priceTableId = Number(row.priceTableId ?? 0);
    const priceTableCode = String(row.priceTable?.nrtabpre ?? "").trim();
    if (!inventoryItemId || !priceTableCode) continue;

    const existing = bestByInventoryItem.get(inventoryItemId);
    if (!existing) {
      bestByInventoryItem.set(inventoryItemId, { unitPrice, priceTableId, priceTableCode });
      continue;
    }

    const shouldReplace =
      unitPrice < existing.unitPrice || (unitPrice === existing.unitPrice && priceTableId < existing.priceTableId);
    if (shouldReplace) {
      bestByInventoryItem.set(inventoryItemId, { unitPrice, priceTableId, priceTableCode });
    }
  }

  for (const [inventoryItemId, row] of bestByInventoryItem.entries()) {
    out.set(inventoryItemId, row.priceTableCode);
  }
  return out;
}

export async function ensurePromotionalCampaignTable(): Promise<void> {
  const g = global as typeof globalThis & { __promotionalCampaignTableEnsured?: boolean };
  if (g.__promotionalCampaignTableEnsured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`promotionalcampaign\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`campaignCode\` VARCHAR(30) NOT NULL,
      \`campaignDescription\` VARCHAR(120) NOT NULL,
      \`active\` TINYINT(1) NOT NULL DEFAULT 1,
      \`customerDocInitial\` VARCHAR(20) NULL,
      \`customerDocFinal\` VARCHAR(20) NULL,
      \`representativeDocInitial\` VARCHAR(20) NULL,
      \`representativeDocFinal\` VARCHAR(20) NULL,
      \`orderTypeCodeInitial\` VARCHAR(20) NULL,
      \`orderTypeCodeFinal\` VARCHAR(20) NULL,
      \`priceTableCodeInitial\` VARCHAR(20) NULL,
      \`priceTableCodeFinal\` VARCHAR(20) NULL,
      \`commercialFamilyCodeInitial\` VARCHAR(20) NULL,
      \`commercialFamilyCodeFinal\` VARCHAR(20) NULL,
      \`itemCodeInitial\` VARCHAR(50) NULL,
      \`itemCodeFinal\` VARCHAR(50) NULL,
      \`paymentConditionCodeInitial\` VARCHAR(20) NULL,
      \`paymentConditionCodeFinal\` VARCHAR(20) NULL,
      \`quantityInitial\` INT NULL,
      \`quantityFinal\` INT NULL,
      \`valueInitial\` FLOAT NULL,
      \`valueFinal\` FLOAT NULL,
      \`weightInitial\` FLOAT NULL,
      \`weightFinal\` FLOAT NULL,
      \`discountType\` INT NOT NULL DEFAULT 1,
      \`discountTypeValue\` FLOAT NOT NULL DEFAULT 0,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`promotionalcampaign_campaignCode_key\` (\`campaignCode\`),
      KEY \`promotionalcampaign_active_idx\` (\`active\`),
      KEY \`promotionalcampaign_description_idx\` (\`campaignDescription\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE \`promotionalcampaign\`
      ADD COLUMN IF NOT EXISTS \`quantityInitial\` INT NULL AFTER \`paymentConditionCodeFinal\`,
      ADD COLUMN IF NOT EXISTS \`quantityFinal\` INT NULL AFTER \`quantityInitial\`
  `);
  g.__promotionalCampaignTableEnsured = true;
}

export async function getBestPromotionalCampaignForOrder(order: CampaignOrder): Promise<PromotionalCampaignResult | null> {
  await ensurePromotionalCampaignTable();

  const items = Array.isArray(order.items) ? order.items : [];
  if (!items.length) return null;

  const campaigns = (await prisma.promotionalCampaign.findMany({
    where: { active: true },
    orderBy: [{ campaignCode: "asc" }],
  })) as CampaignRow[];

  if (!campaigns.length) return null;

  const customerDoc = normalizeDigits(order.customerDoc);
  const representativeDoc = normalizeDigits(order.createdBy?.doc);
  const orderTypeCode = String(order.orderType?.codtipoped ?? order.orderTypeId ?? "").trim();
  const paymentConditionCode = extractPaymentConditionCode(order.paymentTerms);
  const priceTableCodesByInventoryItem = await resolvePriceTableCodesByInventoryItem(order.clientId, order.orderTypeId, items);

  let bestCampaign: PromotionalCampaignResult | null = null;

  for (const campaign of campaigns) {
    if (
      !isWithinRange(customerDoc, campaign.customerDocInitial, campaign.customerDocFinal, "digits") ||
      !isWithinRange(representativeDoc, campaign.representativeDocInitial, campaign.representativeDocFinal, "digits") ||
      !isWithinRange(orderTypeCode, campaign.orderTypeCodeInitial, campaign.orderTypeCodeFinal, "mixed") ||
      !isWithinRange(paymentConditionCode, campaign.paymentConditionCodeInitial, campaign.paymentConditionCodeFinal, "mixed")
    ) {
      continue;
    }

    const eligibleItems = items.filter((item) => {
      const inventoryItemId = Number(item.inventoryItem?.id ?? 0);
      const priceTableCode = inventoryItemId ? priceTableCodesByInventoryItem.get(inventoryItemId) ?? "" : "";
      const commercialFamilyCode =
        String(item.inventoryItem?.commercialFamily?.erpCode ?? item.inventoryItem?.commercialFamilyId ?? "").trim();
      const itemCode = String(item.sku ?? "").trim();

      return (
        isWithinRange(priceTableCode, campaign.priceTableCodeInitial, campaign.priceTableCodeFinal, "mixed") &&
        isWithinRange(commercialFamilyCode, campaign.commercialFamilyCodeInitial, campaign.commercialFamilyCodeFinal, "mixed") &&
        isWithinRange(itemCode, campaign.itemCodeInitial, campaign.itemCodeFinal, "mixed")
      );
    });

    if (!eligibleItems.length) continue;

    const eligibleQuantity = eligibleItems.reduce((sum, item) => sum + computeEligibleQuantity(item), 0);
    const eligibleValue = eligibleItems.reduce((sum, item) => sum + computeEligibleValue(item), 0);
    const eligibleWeight = eligibleItems.reduce((sum, item) => sum + computeWeightKg(item), 0);

    if (
      !isWithinRange(eligibleQuantity, campaign.quantityInitial, campaign.quantityFinal, "mixed") ||
      !isWithinRange(eligibleValue, campaign.valueInitial, campaign.valueFinal, "mixed") ||
      !isWithinRange(eligibleWeight, campaign.weightInitial, campaign.weightFinal, "mixed")
    ) {
      continue;
    }

    const bonusValue =
      Number(campaign.discountType) === 1
        ? eligibleValue * (Number(campaign.discountTypeValue ?? 0) / 100)
        : Number(campaign.discountTypeValue ?? 0);

    const candidate: PromotionalCampaignResult = {
      campaignCode: String(campaign.campaignCode ?? "").trim(),
      campaignDescription: String(campaign.campaignDescription ?? "").trim(),
      eligibleQuantity,
      bonusValue,
      eligibleValue,
      eligibleWeight,
      discountType: Number(campaign.discountType ?? 0),
      discountTypeValue: Number(campaign.discountTypeValue ?? 0),
    };

    if (
      !bestCampaign ||
      candidate.bonusValue > bestCampaign.bonusValue ||
      (candidate.bonusValue === bestCampaign.bonusValue &&
        candidate.campaignCode.localeCompare(bestCampaign.campaignCode, "pt-BR", { sensitivity: "base" }) < 0)
    ) {
      bestCampaign = candidate;
    }
  }

  return bestCampaign;
}
