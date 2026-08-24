CREATE TABLE IF NOT EXISTS `financialtitleattachment` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `financialTitleId` INT NOT NULL,
  `createdById` INT NOT NULL,
  `storedFileName` VARCHAR(255) NOT NULL,
  `originalFileName` VARCHAR(255) NOT NULL,
  `mimeType` VARCHAR(191) NULL,
  `sizeBytes` INT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `financialtitleattachment_title_idx` (`financialTitleId`),
  KEY `financialtitleattachment_createdby_idx` (`createdById`),
  CONSTRAINT `financialtitleattachment_title_fk`
    FOREIGN KEY (`financialTitleId`) REFERENCES `financialtitle` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `financialtitleattachment_createdby_fk`
    FOREIGN KEY (`createdById`) REFERENCES `user` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
