/*
  Warnings:

  - You are about to drop the column `direccion` on the `Store` table. All the data in the column will be lost.
  - You are about to drop the column `lat` on the `Store` table. All the data in the column will be lost.
  - You are about to drop the column `lng` on the `Store` table. All the data in the column will be lost.
  - You are about to drop the column `nombre` on the `Store` table. All the data in the column will be lost.
  - You are about to drop the column `telefono` on the `Store` table. All the data in the column will be lost.
  - Added the required column `address` to the `Store` table without a default value. This is not possible if the table is not empty.
  - Added the required column `storeName` to the `Store` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Store` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Store" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "storeName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" REAL,
    "longitude" REAL,
    "city" TEXT,
    "zipCode" TEXT,
    "email" TEXT,
    "tlf" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Store" ("createdAt", "id") SELECT "createdAt", "id" FROM "Store";
DROP TABLE "Store";
ALTER TABLE "new_Store" RENAME TO "Store";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
