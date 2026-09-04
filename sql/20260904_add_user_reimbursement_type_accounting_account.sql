CREATE TABLE IF NOT EXISTS `userreimbursementtypeaccount` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `userId` INT NOT NULL,
  `reimbursementTypeId` INT NOT NULL,
  `accountingAccount` CHAR(10) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `userreimbursementtypeaccount_user_type_key` (`userId`, `reimbursementTypeId`),
  KEY `userreimbursementtypeaccount_type_idx` (`reimbursementTypeId`),
  CONSTRAINT `userreimbursementtypeaccount_user_fk`
    FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE,
  CONSTRAINT `userreimbursementtypeaccount_reimbursementtype_fk`
    FOREIGN KEY (`reimbursementTypeId`) REFERENCES `reimbursementtype` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
