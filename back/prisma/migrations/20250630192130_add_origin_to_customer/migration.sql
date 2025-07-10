-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Customer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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
INSERT INTO "new_Customer" ("address_1", "createdAt", "id", "lat", "lng", "name", "observations", "phone", "portal", "updatedAt") SELECT "address_1", "createdAt", "id", "lat", "lng", "name", "observations", "phone", "portal", "updatedAt" FROM "Customer";
DROP TABLE "Customer";
ALTER TABLE "new_Customer" RENAME TO "Customer";
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");
CREATE UNIQUE INDEX "Customer_address_1_key" ON "Customer"("address_1");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
