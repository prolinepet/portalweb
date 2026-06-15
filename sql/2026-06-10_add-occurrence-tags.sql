-- Cadastro de TAG da ocorrência (TAG_OCORRENCIA)
-- Campos:
-- - code        INT(6) lógico
-- - description CHAR(60)

CREATE TABLE IF NOT EXISTS `occurrencetag` (
  `code` INT NOT NULL AUTO_INCREMENT,
  `description` CHAR(60) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Se a tabela já existia sem AUTO_INCREMENT, ajusta a coluna
SET @db := DATABASE();
SET @is_ai := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'occurrencetag'
    AND COLUMN_NAME = 'code'
    AND EXTRA LIKE '%auto_increment%'
);

SET @sql := IF(
  @is_ai = 0,
  'ALTER TABLE `occurrencetag` MODIFY COLUMN `code` INT NOT NULL AUTO_INCREMENT',
  'SELECT \"OK: occurrencetag.code já é AUTO_INCREMENT\"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
