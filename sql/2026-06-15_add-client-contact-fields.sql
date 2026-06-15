-- Adiciona campos de contato no cadastro de cliente para suportar preenchimento automático
-- na tela de Cadastro de Reclamação.
-- - email: VARCHAR(191)
-- - phone: VARCHAR(30)

SET @db := DATABASE();

-- email
SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'client'
    AND COLUMN_NAME = 'email'
);

SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `client` ADD COLUMN `email` VARCHAR(191) NULL',
  'SELECT \"OK: client.email já existe\"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- phone
SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'client'
    AND COLUMN_NAME = 'phone'
);

SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `client` ADD COLUMN `phone` VARCHAR(30) NULL',
  'SELECT \"OK: client.phone já existe\"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
