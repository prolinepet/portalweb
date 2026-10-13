ALTER TABLE `financialtitleexpense`
ADD COLUMN IF NOT EXISTS `expenseDate` DATE NULL AFTER `reimbursementTypeId`;
