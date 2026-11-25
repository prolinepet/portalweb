ALTER TABLE `promotionalcampaign`
  ADD COLUMN IF NOT EXISTS `quantityInitial` INT NULL AFTER `paymentConditionCodeFinal`,
  ADD COLUMN IF NOT EXISTS `quantityFinal` INT NULL AFTER `quantityInitial`;
