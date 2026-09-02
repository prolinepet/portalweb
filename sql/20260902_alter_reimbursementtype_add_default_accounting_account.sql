ALTER TABLE `reimbursementtype`
  ADD COLUMN IF NOT EXISTS `defaultAccountingAccount` CHAR(10) NULL AFTER `description`;
