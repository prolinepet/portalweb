-- Adiciona suporte ao código ERP do representante (repCode) no cadastro de usuários.
-- Compatível com MySQL 5.7+ (usa INFORMATION_SCHEMA + PREPARE para rodar de forma idempotente).

SET @db := DATABASE();

-- 1) Coluna repCode
SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'user'
    AND COLUMN_NAME = 'repCode'
);

SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `user` ADD COLUMN `repCode` INT NULL',
  'SELECT \"OK: coluna repCode já existe\"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) Índice para lookup por repCode
SET @idx_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'user'
    AND INDEX_NAME = 'user_repCode_idx'
);

SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `user_repCode_idx` ON `user` (`repCode`)',
  'SELECT \"OK: índice user_repCode_idx já existe\"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
