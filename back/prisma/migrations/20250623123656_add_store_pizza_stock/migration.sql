-- CreateTable
CREATE TABLE "StorePizzaStock" (
    "storeId" INTEGER NOT NULL,
    "pizzaId" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("storeId", "pizzaId"),
    CONSTRAINT "StorePizzaStock_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StorePizzaStock_pizzaId_fkey" FOREIGN KEY ("pizzaId") REFERENCES "MenuPizza" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
