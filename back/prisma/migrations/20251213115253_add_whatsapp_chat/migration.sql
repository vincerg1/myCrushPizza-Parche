-- CreateTable
CREATE TABLE `WhatsAppConversation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `phoneE164` VARCHAR(32) NOT NULL,
    `phoneBase9` VARCHAR(16) NULL,
    `username` VARCHAR(191) NULL,
    `addressText` TEXT NULL,
    `addressUpdatedAt` DATETIME(3) NULL,
    `lastMessageAt` DATETIME(3) NULL,
    `isOpen` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WhatsAppConversation_phoneE164_key`(`phoneE164`),
    INDEX `WhatsAppConversation_lastMessageAt_idx`(`lastMessageAt`),
    INDEX `WhatsAppConversation_phoneBase9_idx`(`phoneBase9`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WhatsAppMessage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `conversationId` INTEGER NOT NULL,
    `waMessageId` VARCHAR(191) NULL,
    `direction` ENUM('IN', 'OUT') NOT NULL,
    `status` ENUM('RECEIVED', 'SENT', 'DELIVERED', 'READ', 'FAILED') NOT NULL DEFAULT 'RECEIVED',
    `from` VARCHAR(32) NOT NULL,
    `to` VARCHAR(32) NULL,
    `type` VARCHAR(32) NULL,
    `text` TEXT NULL,
    `timestamp` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `WhatsAppMessage_waMessageId_key`(`waMessageId`),
    INDEX `WhatsAppMessage_conversationId_createdAt_idx`(`conversationId`, `createdAt`),
    INDEX `WhatsAppMessage_from_idx`(`from`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `WhatsAppMessage` ADD CONSTRAINT `WhatsAppMessage_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `WhatsAppConversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
