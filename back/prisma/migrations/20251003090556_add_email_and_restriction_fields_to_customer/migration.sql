/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `Customer` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `Customer` ADD COLUMN `email` VARCHAR(191) NULL,
    ADD COLUMN `isRestricted` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `restrictedAt` DATETIME(3) NULL,
    ADD COLUMN `restrictionReason` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Customer_email_key` ON `Customer`(`email`);
