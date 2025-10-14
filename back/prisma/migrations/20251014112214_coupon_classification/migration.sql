-- AlterTable
ALTER TABLE `Coupon` ADD COLUMN `acquisition` ENUM('GRATIS', 'COMPRA', 'JUEGO') NULL,
    ADD COLUMN `logic` ENUM('RANDOM', 'PERCENT', 'AMOUNT') NULL,
    ADD COLUMN `meta` JSON NULL;

-- CreateIndex
CREATE INDEX `Coupon_acquisition_idx` ON `Coupon`(`acquisition`);

-- CreateIndex
CREATE INDEX `Coupon_logic_idx` ON `Coupon`(`logic`);
