/*
  Warnings:

  - You are about to drop the column `ingredients` on the `MenuPizza` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `MenuPizza` DROP COLUMN `ingredients`;

-- CreateTable
CREATE TABLE `MenuPizzaIngredient` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `menuPizzaId` INTEGER NOT NULL,
    `ingredientId` INTEGER NOT NULL,
    `qtyBySize` JSON NOT NULL,

    INDEX `MenuPizzaIngredient_ingredientId_idx`(`ingredientId`),
    INDEX `MenuPizzaIngredient_menuPizzaId_idx`(`menuPizzaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MenuPizzaIngredient` ADD CONSTRAINT `MenuPizzaIngredient_menuPizzaId_fkey` FOREIGN KEY (`menuPizzaId`) REFERENCES `MenuPizza`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MenuPizzaIngredient` ADD CONSTRAINT `MenuPizzaIngredient_ingredientId_fkey` FOREIGN KEY (`ingredientId`) REFERENCES `Ingredient`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
