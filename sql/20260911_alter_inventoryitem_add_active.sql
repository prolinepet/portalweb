ALTER TABLE `inventoryitem`
  ADD COLUMN IF NOT EXISTS `active` TINYINT(1) NOT NULL DEFAULT 1 AFTER `sku`;

UPDATE `inventoryitem`
SET `active` = 1
WHERE `active` IS NULL;
