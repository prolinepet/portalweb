ALTER TABLE `user`
  ADD COLUMN IF NOT EXISTS `reimbursementApprover` TINYINT(1) NOT NULL DEFAULT 0 AFTER `isSalesAdmin`;

UPDATE `user`
SET `reimbursementApprover` = 0
WHERE `reimbursementApprover` IS NULL;
