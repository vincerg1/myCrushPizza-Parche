/*
  Warnings:

  - You are about to drop the column `used` on the `Coupon` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `Coupon` DROP COLUMN `used`,
    ADD COLUMN `activeFrom` DATETIME(3) NULL,
    ADD COLUMN `amount` DECIMAL(10, 2) NULL,
    ADD COLUMN `assignedToId` INTEGER NULL,
    ADD COLUMN `daysActive` JSON NULL,
    ADD COLUMN `kind` ENUM('PERCENT', 'AMOUNT') NOT NULL DEFAULT 'PERCENT',
    ADD COLUMN `maxAmount` DECIMAL(10, 2) NULL,
    ADD COLUMN `percentMax` INTEGER NULL,
    ADD COLUMN `percentMin` INTEGER NULL,
    ADD COLUMN `segments` JSON NULL,
    ADD COLUMN `status` ENUM('ACTIVE', 'USED', 'EXPIRED', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN `usageLimit` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `usedCount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `variant` ENUM('FIXED', 'RANGE') NOT NULL DEFAULT 'FIXED',
    ADD COLUMN `windowEnd` INTEGER NULL,
    ADD COLUMN `windowStart` INTEGER NULL,
    MODIFY `percent` INTEGER NULL;

-- CreateIndex
CREATE INDEX `Coupon_status_idx` ON `Coupon`(`status`);

-- CreateIndex
CREATE INDEX `Coupon_assignedToId_idx` ON `Coupon`(`assignedToId`);

-- CreateIndex
CREATE INDEX `Coupon_expiresAt_idx` ON `Coupon`(`expiresAt`);

-- AddForeignKey
ALTER TABLE `Coupon` ADD CONSTRAINT `Coupon_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
