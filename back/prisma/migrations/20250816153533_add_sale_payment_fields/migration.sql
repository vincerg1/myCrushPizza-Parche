/*
  Warnings:

  - A unique constraint covering the columns `[stripePaymentIntentId]` on the table `Sale` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripeCheckoutSessionId]` on the table `Sale` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `Sale` ADD COLUMN `address_1` VARCHAR(191) NULL,
    ADD COLUMN `channel` ENUM('WHATSAPP', 'PHONE', 'WEB') NOT NULL DEFAULT 'WHATSAPP',
    ADD COLUMN `currency` VARCHAR(191) NOT NULL DEFAULT 'EUR',
    ADD COLUMN `lat` DOUBLE NULL,
    ADD COLUMN `lng` DOUBLE NULL,
    ADD COLUMN `status` ENUM('PENDING', 'AWAITING_PAYMENT', 'PAID', 'CANCELED') NOT NULL DEFAULT 'PENDING',
    ADD COLUMN `stripeCheckoutSessionId` VARCHAR(191) NULL,
    ADD COLUMN `stripePaymentIntentId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Sale_stripePaymentIntentId_key` ON `Sale`(`stripePaymentIntentId`);

-- CreateIndex
CREATE UNIQUE INDEX `Sale_stripeCheckoutSessionId_key` ON `Sale`(`stripeCheckoutSessionId`);
