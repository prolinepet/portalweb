ALTER TABLE `financialtitle`
  MODIFY COLUMN `status` VARCHAR(30) NOT NULL DEFAULT 'EM_DIGITACAO',
  ADD COLUMN IF NOT EXISTS `approvalStatus` VARCHAR(20) NOT NULL DEFAULT 'PENDENTE' AFTER `status`;

UPDATE `financialtitle`
SET
  `status` = CASE
    WHEN `integrated` = 1 THEN 'INTEGRADO'
    WHEN UPPER(TRIM(COALESCE(`status`, ''))) IN ('', 'ABERTO', 'PAGO') THEN 'EM_DIGITACAO'
    ELSE `status`
  END,
  `approvalStatus` = CASE
    WHEN `integrated` = 1 THEN 'APROVADO'
    WHEN UPPER(TRIM(COALESCE(`approvalStatus`, ''))) IN ('', 'NULL') THEN 'PENDENTE'
    ELSE `approvalStatus`
  END;
