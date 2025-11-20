-- DropIndex
DROP INDEX `Customer_address_1_key` ON `Customer`;

-- CreateIndex
CREATE INDEX `GamePlay_gameId_createdAt_idx` ON `GamePlay`(`gameId`, `createdAt`);

-- CreateIndex
CREATE INDEX `GamePlay_playerId_createdAt_idx` ON `GamePlay`(`playerId`, `createdAt`);

-- AddForeignKey
ALTER TABLE `Game` ADD CONSTRAINT `Game_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
