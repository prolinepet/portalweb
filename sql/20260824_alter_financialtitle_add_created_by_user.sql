ALTER TABLE `financialtitle`
  ADD COLUMN `createdByUserId` INT NULL AFTER `entityId`;

ALTER TABLE `financialtitle`
  ADD INDEX `financialtitle_created_by_idx` (`createdByUserId`);

ALTER TABLE `financialtitle`
  ADD CONSTRAINT `financialtitle_created_by_user_fk`
    FOREIGN KEY (`createdByUserId`) REFERENCES `user` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE;
