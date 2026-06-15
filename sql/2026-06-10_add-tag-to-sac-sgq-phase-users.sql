-- Suporte à TAG no vínculo usuário x fase de Processos SAC/SGQ
-- Este script:
-- 1) Garante a tabela occurrencetag
-- 2) Adiciona tagCode em sacsgqphaseuser
-- 3) Ajusta índice único para permitir o mesmo usuário na mesma fase com TAGs diferentes
-- 4) Cria índice e FK de tagCode

SET @db := DATABASE();

-- 1) Tabela de TAG de ocorrência
CREATE TABLE IF NOT EXISTS `occurrencetag` (
  `code` INT NOT NULL,
  `description` CHAR(60) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) Coluna tagCode em sacsgqphaseuser
SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'sacsgqphaseuser'
    AND COLUMN_NAME = 'tagCode'
);

SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `sacsgqphaseuser` ADD COLUMN `tagCode` INT NULL',
  'SELECT "OK: coluna tagCode já existe"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3) Índice de tagCode
SET @idx_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'sacsgqphaseuser'
    AND INDEX_NAME = 'sacsgqphaseuser_tag_idx'
);

SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `sacsgqphaseuser_tag_idx` ON `sacsgqphaseuser` (`tagCode`)',
  'SELECT "OK: índice sacsgqphaseuser_tag_idx já existe"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4) Remove unique antigo (phaseId, userId), se existir
SET @old_unique_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'sacsgqphaseuser'
    AND INDEX_NAME = 'sacsgqphaseuser_phase_user_key'
);

SET @sql := IF(
  @old_unique_exists > 0,
  'ALTER TABLE `sacsgqphaseuser` DROP INDEX `sacsgqphaseuser_phase_user_key`',
  'SELECT "OK: índice único antigo não existe"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 5) Cria unique novo (phaseId, userId, tagCode)
SET @new_unique_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'sacsgqphaseuser'
    AND INDEX_NAME = 'sacsgqphaseuser_phase_user_tag_key'
);

SET @sql := IF(
  @new_unique_exists = 0,
  'ALTER TABLE `sacsgqphaseuser` ADD UNIQUE KEY `sacsgqphaseuser_phase_user_tag_key` (`phaseId`, `userId`, `tagCode`)',
  'SELECT "OK: índice único novo já existe"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 6) FK de tagCode -> occurrencetag(code)
SET @fk_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = @db
    AND TABLE_NAME = 'sacsgqphaseuser'
    AND CONSTRAINT_NAME = 'sacsgqphaseuser_tag_fk'
);

SET @sql := IF(
  @fk_exists = 0,
  'ALTER TABLE `sacsgqphaseuser` ADD CONSTRAINT `sacsgqphaseuser_tag_fk` FOREIGN KEY (`tagCode`) REFERENCES `occurrencetag`(`code`) ON DELETE SET NULL',
  'SELECT "OK: FK sacsgqphaseuser_tag_fk já existe"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
