CREATE TABLE IF NOT EXISTS `logisticpanelprocess` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `entityId` INT NOT NULL,
  `plate` VARCHAR(20) NULL,
  `motorista` VARCHAR(120) NULL,
  `transportadora` VARCHAR(120) NULL,
  `faseLogistica` VARCHAR(120) NULL,
  `statusAnterior` VARCHAR(120) NULL,
  `statusAtual` VARCHAR(120) NULL,
  `statusProxima` VARCHAR(120) NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_logisticpanelprocess_entity_created` (`entityId`, `createdAt`),
  CONSTRAINT `fk_logisticpanelprocess_entity`
    FOREIGN KEY (`entityId`) REFERENCES `entity` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `logisticpanelprocessprecarga` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `processId` INT NOT NULL,
  `preCargaId` INT NOT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_logisticpanelprocessprecarga_precarga` (`preCargaId`),
  UNIQUE KEY `ux_logisticpanelprocessprecarga_process_precarga` (`processId`, `preCargaId`),
  KEY `idx_logisticpanelprocessprecarga_process` (`processId`),
  CONSTRAINT `fk_logisticpanelprocessprecarga_process`
    FOREIGN KEY (`processId`) REFERENCES `logisticpanelprocess` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_logisticpanelprocessprecarga_precarga`
    FOREIGN KEY (`preCargaId`) REFERENCES `logisticprecarga` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
