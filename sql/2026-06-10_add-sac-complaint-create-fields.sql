-- Suporte inicial para a nova tela "Cadastro de Reclamação" (SAC_COMPLAINT_CREATE)
--
-- Observação importante:
-- O campo "Nr. Ocorrência" deve usar o `id` da tabela `complaint`,
-- que já é INT com AUTO_INCREMENT no modelo atual.
-- Portanto, este script NÃO cria um segundo campo auto incremento.
--
-- Campos já existentes no modelo e que podem ser reaproveitados:
-- - Cliente/Fornec  -> complaint.counterpartyName
-- - E-mail          -> complaint.contactEmail
-- - Telefone        -> complaint.contactPhone
--
-- Campos novos adicionados por este script:
-- - processSacSgq   -> processo SAC/SGQ
-- - occurrenceDate  -> data da ocorrência
-- - status          -> situação
-- - cpfCnpj         -> CPF/CNPJ

SET @db := DATABASE();

-- 1) Processo SAC/SGQ
SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'complaint'
    AND COLUMN_NAME = 'processSacSgq'
);

SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `complaint` ADD COLUMN `processSacSgq` INT NULL',
  'SELECT "OK: coluna processSacSgq já existe"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) Data da ocorrência
SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'complaint'
    AND COLUMN_NAME = 'occurrenceDate'
);

SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `complaint` ADD COLUMN `occurrenceDate` DATE NULL',
  'SELECT "OK: coluna occurrenceDate já existe"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3) Situação
SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'complaint'
    AND COLUMN_NAME = 'status'
);

SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `complaint` ADD COLUMN `status` VARCHAR(60) NULL',
  'SELECT "OK: coluna status já existe"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4) CPF/CNPJ
SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'complaint'
    AND COLUMN_NAME = 'cpfCnpj'
);

SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `complaint` ADD COLUMN `cpfCnpj` VARCHAR(20) NULL',
  'SELECT "OK: coluna cpfCnpj já existe"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
