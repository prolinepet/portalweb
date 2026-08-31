ALTER TABLE `financialtitle`
  DROP INDEX `financialtitle_entity_numero_key`,
  ADD UNIQUE KEY `financialtitle_entity_user_numero_key` (`entityId`, `createdByUserId`, `numero`);
