/*
  Warnings:

  - Made the column `code` on table `Customer` required. This step will fail if there are existing NULL values in that column.
  - Made the column `code` on table `Sale` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Customer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "address_1" TEXT NOT NULL,
    "portal" TEXT,
    "observations" TEXT,
    "lat" REAL,
    "lng" REAL,
    "origin" TEXT NOT NULL DEFAULT 'PHONE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Customer" ("address_1", "code", "createdAt", "id", "lat", "lng", "name", "observations", "origin", "phone", "portal", "updatedAt") SELECT "address_1", "code", "createdAt", "id", "lat", "lng", "name", "observations", "origin", "phone", "portal", "updatedAt" FROM "Customer";
DROP TABLE "Customer";
ALTER TABLE "new_Customer" RENAME TO "Customer";
CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");
CREATE UNIQUE INDEX "Customer_address_1_key" ON "Customer"("address_1");
CREATE TABLE "new_Sale" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storeId" INTEGER NOT NULL,
    "customerId" INTEGER,
    "type" TEXT NOT NULL,
    "delivery" TEXT NOT NULL,
    "customerData" JSONB,
    "products" JSONB NOT NULL,
    "extras" JSONB NOT NULL DEFAULT [],
    "totalProducts" REAL NOT NULL,
    "discounts" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Sale_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Sale" ("code", "createdAt", "customerData", "customerId", "date", "delivery", "discounts", "extras", "id", "notes", "processed", "products", "storeId", "total", "totalProducts", "type") SELECT "code", "createdAt", "customerData", "customerId", "date", "delivery", "discounts", "extras", "id", "notes", "processed", "products", "storeId", "total", "totalProducts", "type" FROM "Sale";
DROP TABLE "Sale";
ALTER TABLE "new_Sale" RENAME TO "Sale";
CREATE UNIQUE INDEX "Sale_code_key" ON "Sale"("code");
CREATE INDEX "Sale_date_idx" ON "Sale"("date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
