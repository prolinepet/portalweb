-- Estruturas para:
-- 1) Anexos de Reclamação
-- 2) Dados de Faturamento integrados do ERP

SET @db := DATABASE();

-- =========================================================
-- 1) Complementos da tabela complaint para fluxo SAC/SGQ
-- =========================================================

SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'complaint'
    AND COLUMN_NAME = 'occurrenceDate'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `complaint` ADD COLUMN `occurrenceDate` DATETIME NULL',
  'SELECT "OK: complaint.occurrenceDate já existe"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'complaint'
    AND COLUMN_NAME = 'sacSgqProcessId'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `complaint` ADD COLUMN `sacSgqProcessId` INT NULL',
  'SELECT "OK: complaint.sacSgqProcessId já existe"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'complaint'
    AND COLUMN_NAME = 'sacSgqPhaseId'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `complaint` ADD COLUMN `sacSgqPhaseId` INT NULL',
  'SELECT "OK: complaint.sacSgqPhaseId já existe"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'complaint'
    AND COLUMN_NAME = 'responsibleUserId'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `complaint` ADD COLUMN `responsibleUserId` INT NULL',
  'SELECT "OK: complaint.responsibleUserId já existe"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'complaint'
    AND COLUMN_NAME = 'previousUserId'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `complaint` ADD COLUMN `previousUserId` INT NULL',
  'SELECT "OK: complaint.previousUserId já existe"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'complaint'
    AND COLUMN_NAME = 'nextUserId'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `complaint` ADD COLUMN `nextUserId` INT NULL',
  'SELECT "OK: complaint.nextUserId já existe"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'complaint'
    AND INDEX_NAME = 'complaint_sacsgq_process_phase_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `complaint_sacsgq_process_phase_idx` ON `complaint` (`sacSgqProcessId`, `sacSgqPhaseId`)',
  'SELECT "OK: índice complaint_sacsgq_process_phase_idx já existe"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'complaint'
    AND INDEX_NAME = 'complaint_responsible_user_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `complaint_responsible_user_idx` ON `complaint` (`responsibleUserId`)',
  'SELECT "OK: índice complaint_responsible_user_idx já existe"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =========================================================
-- 2) Tabela de anexos da reclamação
-- =========================================================

CREATE TABLE IF NOT EXISTS `complaintattachment` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `complaintId` INT NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `storedFileName` VARCHAR(255) NOT NULL,
  `originalFileName` VARCHAR(255) NOT NULL,
  `mimeType` VARCHAR(191) NULL,
  `sizeBytes` INT NULL,
  `createdById` INT NOT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `complaintattachment_complaint_idx` (`complaintId`),
  KEY `complaintattachment_createdby_idx` (`createdById`),
  CONSTRAINT `complaintattachment_complaint_fk` FOREIGN KEY (`complaintId`) REFERENCES `complaint`(`id`) ON DELETE CASCADE,
  CONSTRAINT `complaintattachment_createdby_fk` FOREIGN KEY (`createdById`) REFERENCES `user`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- 3) Tabela de faturamento integrada do ERP
-- =========================================================

CREATE TABLE IF NOT EXISTS `billinginvoicerecord` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `estab` INT NOT NULL,
  `clientId` INT NULL,
  `canal` VARCHAR(30) NULL,
  `dtEmissao` DATE NULL,
  `natOper` VARCHAR(30) NULL,
  `priceTableId` INT NULL,
  `inventoryItemId` INT NOT NULL,
  `pesoUnit` DOUBLE NULL,
  `commercialFamilyId` INT NULL,
  `nroNota` INT NOT NULL,
  `serie` CHAR(5) NOT NULL,
  `pesoLiq` DOUBLE NULL,
  `vlMercLiq` DOUBLE NULL,
  `vlMercBru` DOUBLE NULL,
  `vlCusto` DOUBLE NULL,
  `margemPercent` DOUBLE NULL,
  `orderTypeId` INT NULL,
  `representativeUserId` INT NULL,
  `pedido` VARCHAR(40) NULL,
  `dataEmissaoPedido` DATE NULL,
  `valorFrete` DOUBLE NULL,
  `descItem` DOUBLE NULL,
  `nrSeqFat` INT NOT NULL,
  `nrSeqDev` INT NOT NULL,
  `tipoFatura` VARCHAR(30) NOT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `billinginvoicerecord_unique_key` (`estab`, `serie`, `nroNota`, `nrSeqFat`, `nrSeqDev`, `inventoryItemId`, `tipoFatura`),
  KEY `billinginvoicerecord_client_idx` (`clientId`),
  KEY `billinginvoicerecord_pricetable_idx` (`priceTableId`),
  KEY `billinginvoicerecord_inventoryitem_idx` (`inventoryItemId`),
  KEY `billinginvoicerecord_commercialfamily_idx` (`commercialFamilyId`),
  KEY `billinginvoicerecord_ordertype_idx` (`orderTypeId`),
  KEY `billinginvoicerecord_representative_idx` (`representativeUserId`),
  CONSTRAINT `billinginvoicerecord_client_fk` FOREIGN KEY (`clientId`) REFERENCES `client`(`id`) ON DELETE SET NULL,
  CONSTRAINT `billinginvoicerecord_pricetable_fk` FOREIGN KEY (`priceTableId`) REFERENCES `tabelapreco`(`id`) ON DELETE SET NULL,
  CONSTRAINT `billinginvoicerecord_inventoryitem_fk` FOREIGN KEY (`inventoryItemId`) REFERENCES `inventoryitem`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `billinginvoicerecord_commercialfamily_fk` FOREIGN KEY (`commercialFamilyId`) REFERENCES `commercialfamily`(`id`) ON DELETE SET NULL,
  CONSTRAINT `billinginvoicerecord_ordertype_fk` FOREIGN KEY (`orderTypeId`) REFERENCES `tipopedido`(`id`) ON DELETE SET NULL,
  CONSTRAINT `billinginvoicerecord_representative_fk` FOREIGN KEY (`representativeUserId`) REFERENCES `user`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
