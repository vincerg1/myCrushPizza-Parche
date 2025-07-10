-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StorePizzaStock" (
    "storeId" INTEGER NOT NULL,
    "pizzaId" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("storeId", "pizzaId"),
    CONSTRAINT "StorePizzaStock_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StorePizzaStock_pizzaId_fkey" FOREIGN KEY ("pizzaId") REFERENCES "MenuPizza" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_StorePizzaStock" ("pizzaId", "stock", "storeId") SELECT "pizzaId", "stock", "storeId" FROM "StorePizzaStock";
DROP TABLE "StorePizzaStock";
ALTER TABLE "new_StorePizzaStock" RENAME TO "StorePizzaStock";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
