-- Suporte ao cadastro "Processos SAC/SGQ" (programa PROCESSOS_SACSGQ)
-- Tabelas:
-- - sacsgqprocess        (processo)
-- - sacsgqprocessphase   (fases do processo)
-- - sacsgqphaseuser      (usuários vinculados à fase)
--
-- Observação:
-- A API também cria essas tabelas automaticamente quando chamada, mas este SQL
-- permite antecipar a criação no banco (deploy controlado).

-- 1) Processo
CREATE TABLE IF NOT EXISTS `sacsgqprocess` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `code` INT NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `isActive` TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sacsgqprocess_code_key` (`code`),
  KEY `sacsgqprocess_description_idx` (`description`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2) Fases do processo
CREATE TABLE IF NOT EXISTS `sacsgqprocessphase` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `processId` INT NOT NULL,
  `code` INT NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `sequence` INT NOT NULL DEFAULT 1,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sacsgqprocessphase_process_code_key` (`processId`, `code`),
  KEY `sacsgqprocessphase_process_idx` (`processId`),
  KEY `sacsgqprocessphase_process_seq_idx` (`processId`, `sequence`),
  CONSTRAINT `sacsgqprocessphase_process_fk`
    FOREIGN KEY (`processId`) REFERENCES `sacsgqprocess` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3) Usuários por fase
CREATE TABLE IF NOT EXISTS `sacsgqphaseuser` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `phaseId` INT NOT NULL,
  `userId` INT NOT NULL,
  `allowReturn` TINYINT(1) NOT NULL DEFAULT 0,
  `allowNext` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sacsgqphaseuser_phase_user_key` (`phaseId`, `userId`),
  KEY `sacsgqphaseuser_phase_idx` (`phaseId`),
  KEY `sacsgqphaseuser_user_idx` (`userId`),
  CONSTRAINT `sacsgqphaseuser_phase_fk`
    FOREIGN KEY (`phaseId`) REFERENCES `sacsgqprocessphase` (`id`) ON DELETE CASCADE,
  CONSTRAINT `sacsgqphaseuser_user_fk`
    FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
