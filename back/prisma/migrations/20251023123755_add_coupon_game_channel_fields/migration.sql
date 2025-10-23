/*
  Warnings:

  - You are about to drop the column `logic` on the `Coupon` table. All the data in the column will be lost.
  - The values [GRATIS,COMPRA,JUEGO] on the enum `CouponRedemption_acquisition` will be removed. If these variants are still used in the database, this will fail.

*/
-- DropIndex
DROP INDEX `Coupon_logic_idx` ON `Coupon`;

-- AlterTable
ALTER TABLE `Coupon` DROP COLUMN `logic`,
    ADD COLUMN `campaign` VARCHAR(191) NULL,
    ADD COLUMN `channel` ENUM('GAME', 'WEB', 'CRM', 'STORE', 'APP', 'SMS', 'EMAIL') NULL,
    ADD COLUMN `gameId` INTEGER NULL,
    MODIFY `acquisition` ENUM('GAME', 'CLAIM', 'REWARD', 'BULK', 'DIRECT', 'OTHER') NULL;

-- AlterTable
ALTER TABLE `CouponRedemption` ADD COLUMN `acquisition` ENUM('GAME', 'CLAIM', 'REWARD', 'BULK', 'DIRECT', 'OTHER') NULL,
    ADD COLUMN `campaign` VARCHAR(191) NULL,
    ADD COLUMN `channel` ENUM('GAME', 'WEB', 'CRM', 'STORE', 'APP', 'SMS', 'EMAIL') NULL,
    ADD COLUMN `gameId` INTEGER NULL;

-- CreateIndex
CREATE INDEX `Coupon_channel_idx` ON `Coupon`(`channel`);

-- CreateIndex
CREATE INDEX `Coupon_gameId_idx` ON `Coupon`(`gameId`);

-- CreateIndex
CREATE INDEX `Coupon_acquisition_gameId_idx` ON `Coupon`(`acquisition`, `gameId`);

-- CreateIndex
CREATE INDEX `CouponRedemption_gameId_idx` ON `CouponRedemption`(`gameId`);

-- CreateIndex
CREATE INDEX `CouponRedemption_channel_idx` ON `CouponRedemption`(`channel`);

-- CreateIndex
CREATE INDEX `CouponRedemption_acquisition_idx` ON `CouponRedemption`(`acquisition`);
