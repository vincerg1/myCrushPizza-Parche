-- AlterTable
ALTER TABLE `Customer` ADD COLUMN `segment` ENUM('S1', 'S2', 'S3', 'S4') NOT NULL DEFAULT 'S1',
    ADD COLUMN `segmentUpdatedAt` DATETIME(3) NULL;
