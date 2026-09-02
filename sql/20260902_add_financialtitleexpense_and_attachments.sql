CREATE TABLE IF NOT EXISTS `financialtitleexpense` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `financialTitleId` INT NOT NULL,
  `reimbursementTypeId` INT NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `amount` DOUBLE NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `financialtitleexpense_title_idx` (`financialTitleId`),
  KEY `financialtitleexpense_reimbursement_idx` (`reimbursementTypeId`),
  CONSTRAINT `financialtitleexpense_title_fk`
    FOREIGN KEY (`financialTitleId`) REFERENCES `financialtitle` (`id`) ON DELETE CASCADE,
  CONSTRAINT `financialtitleexpense_reimbursement_fk`
    FOREIGN KEY (`reimbursementTypeId`) REFERENCES `reimbursementtype` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `financialtitleexpenseattachment` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `financialTitleExpenseId` INT NOT NULL,
  `createdById` INT NOT NULL,
  `storedFileName` VARCHAR(255) NOT NULL,
  `originalFileName` VARCHAR(255) NOT NULL,
  `mimeType` VARCHAR(191) NULL,
  `sizeBytes` INT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `financialtitleexpenseattachment_expense_idx` (`financialTitleExpenseId`),
  KEY `financialtitleexpenseattachment_createdby_idx` (`createdById`),
  CONSTRAINT `financialtitleexpenseattachment_expense_fk`
    FOREIGN KEY (`financialTitleExpenseId`) REFERENCES `financialtitleexpense` (`id`) ON DELETE CASCADE,
  CONSTRAINT `financialtitleexpenseattachment_createdby_fk`
    FOREIGN KEY (`createdById`) REFERENCES `user` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `financialtitleexpense` (`financialTitleId`, `reimbursementTypeId`, `description`, `amount`, `createdAt`, `updatedAt`)
SELECT
  ft.`id`,
  ft.`reimbursementTypeId`,
  COALESCE(NULLIF(TRIM(ft.`description`), ''), CONCAT('Reembolso ', ft.`numero`)),
  ft.`amount`,
  ft.`createdAt`,
  ft.`updatedAt`
FROM `financialtitle` ft
WHERE ft.`reimbursementTypeId` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM `financialtitleexpense` fte
    WHERE fte.`financialTitleId` = ft.`id`
  );

INSERT INTO `financialtitleexpenseattachment` (`financialTitleExpenseId`, `createdById`, `storedFileName`, `originalFileName`, `mimeType`, `sizeBytes`, `createdAt`, `updatedAt`)
SELECT
  expense_map.`expenseId`,
  legacy.`createdById`,
  legacy.`storedFileName`,
  legacy.`originalFileName`,
  legacy.`mimeType`,
  legacy.`sizeBytes`,
  legacy.`createdAt`,
  legacy.`updatedAt`
FROM `financialtitleattachment` legacy
INNER JOIN (
  SELECT `financialTitleId`, MIN(`id`) AS `expenseId`
  FROM `financialtitleexpense`
  GROUP BY `financialTitleId`
) expense_map
  ON expense_map.`financialTitleId` = legacy.`financialTitleId`
WHERE NOT EXISTS (
  SELECT 1
  FROM `financialtitleexpenseattachment` new_att
  WHERE new_att.`financialTitleExpenseId` = expense_map.`expenseId`
    AND new_att.`storedFileName` = legacy.`storedFileName`
);
