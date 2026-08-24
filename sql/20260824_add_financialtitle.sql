CREATE TABLE IF NOT EXISTS `financialtitle` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `entityId` INT NOT NULL,
  `createdByUserId` INT NULL,
  `reimbursementTypeId` INT NULL,
  `kind` VARCHAR(20) NOT NULL,
  `numero` VARCHAR(30) NOT NULL,
  `dueDate` DATETIME(3) NOT NULL,
  `amount` DOUBLE NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'ABERTO',
  `integrated` TINYINT(1) NOT NULL DEFAULT 0,
  `description` VARCHAR(255) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `financialtitle_entity_numero_key` (`entityId`, `numero`),
  KEY `financialtitle_entity_kind_due_idx` (`entityId`, `kind`, `dueDate`),
  KEY `financialtitle_entity_status_idx` (`entityId`, `status`),
  KEY `financialtitle_created_by_idx` (`createdByUserId`),
  KEY `financialtitle_reimbursement_idx` (`reimbursementTypeId`),
  CONSTRAINT `financialtitle_entity_fk`
    FOREIGN KEY (`entityId`) REFERENCES `entity` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `financialtitle_created_by_user_fk`
    FOREIGN KEY (`createdByUserId`) REFERENCES `user` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT `financialtitle_reimbursementtype_fk`
    FOREIGN KEY (`reimbursementTypeId`) REFERENCES `reimbursementtype` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
