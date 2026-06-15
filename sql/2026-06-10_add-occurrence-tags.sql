-- Cadastro de TAG da ocorrência (TAG_OCORRENCIA)
-- Campos:
-- - code        INT(6) lógico
-- - description CHAR(60)

CREATE TABLE IF NOT EXISTS `occurrencetag` (
  `code` INT NOT NULL,
  `description` CHAR(60) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
