-- CreateTable
CREATE TABLE "Customer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'WALKIN',
    "addresses" JSONB NOT NULL DEFAULT [],
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storeId" INTEGER NOT NULL,
    "customerId" INTEGER,
    "type" TEXT NOT NULL,
    "delivery" TEXT NOT NULL,
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

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StorePizzaStock" (
    "storeId" INTEGER NOT NULL,
    "pizzaId" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("storeId", "pizzaId"),
    CONSTRAINT "StorePizzaStock_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StorePizzaStock_pizzaId_fkey" FOREIGN KEY ("pizzaId") REFERENCES "MenuPizza" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_StorePizzaStock" ("createdAt", "pizzaId", "stock", "storeId", "updatedAt") SELECT "createdAt", "pizzaId", "stock", "storeId", "updatedAt" FROM "StorePizzaStock";
DROP TABLE "StorePizzaStock";
ALTER TABLE "new_StorePizzaStock" RENAME TO "StorePizzaStock";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Sale_date_idx" ON "Sale"("date");
