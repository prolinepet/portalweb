CREATE TABLE IF NOT EXISTS `clientinvoice` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `clientId` INT NOT NULL,
  `invoiceNumber` VARCHAR(191) NOT NULL,
  `issueDate` DATETIME NOT NULL,
  `dueDate` DATETIME NULL,
  `totalValue` FLOAT NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'EM_ABERTO',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_clientinvoice_client_invoice` (`clientId`, `invoiceNumber`),
  KEY `idx_clientinvoice_clientid` (`clientId`),
  KEY `idx_clientinvoice_duedate` (`dueDate`),
  KEY `idx_clientinvoice_status` (`status`),
  CONSTRAINT `fk_clientinvoice_client`
    FOREIGN KEY (`clientId`) REFERENCES `client` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
