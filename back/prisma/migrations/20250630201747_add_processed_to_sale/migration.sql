-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Sale" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storeId" INTEGER NOT NULL,
    "customerId" INTEGER,
    "type" TEXT NOT NULL,
    "delivery" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "customerData" JSONB,
    "products" JSONB NOT NULL,
    "extras" JSONB NOT NULL DEFAULT [],
    "totalProducts" REAL NOT NULL,
    "discounts" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Sale_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Sale" ("createdAt", "customerData", "customerId", "date", "delivery", "discounts", "extras", "id", "notes", "products", "storeId", "total", "totalProducts", "type") SELECT "createdAt", "customerData", "customerId", "date", "delivery", "discounts", "extras", "id", "notes", "products", "storeId", "total", "totalProducts", "type" FROM "Sale";
DROP TABLE "Sale";
ALTER TABLE "new_Sale" RENAME TO "Sale";
CREATE INDEX "Sale_date_idx" ON "Sale"("date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
