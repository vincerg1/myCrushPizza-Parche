-- CreateTable
CREATE TABLE `CouponRedemption` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `couponId` INTEGER NULL,
    `saleId` INTEGER NULL,
    `customerId` INTEGER NULL,
    `storeId` INTEGER NULL,
    `couponCode` VARCHAR(191) NOT NULL,
    `segmentAtRedeem` ENUM('S1', 'S2', 'S3', 'S4') NULL,
    `kind` ENUM('PERCENT', 'AMOUNT') NOT NULL,
    `variant` ENUM('FIXED', 'RANGE') NOT NULL,
    `percentApplied` INTEGER NULL,
    `amountApplied` DECIMAL(10, 2) NULL,
    `discountValue` DECIMAL(10, 2) NULL,
    `redeemedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CouponRedemption_couponCode_idx`(`couponCode`),
    INDEX `CouponRedemption_redeemedAt_idx`(`redeemedAt`),
    INDEX `CouponRedemption_saleId_idx`(`saleId`),
    INDEX `CouponRedemption_customerId_idx`(`customerId`),
    INDEX `CouponRedemption_storeId_idx`(`storeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CouponRedemption` ADD CONSTRAINT `CouponRedemption_couponId_fkey` FOREIGN KEY (`couponId`) REFERENCES `Coupon`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CouponRedemption` ADD CONSTRAINT `CouponRedemption_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `Sale`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CouponRedemption` ADD CONSTRAINT `CouponRedemption_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CouponRedemption` ADD CONSTRAINT `CouponRedemption_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
