/*
  Warnings:

  - A unique constraint covering the columns `[address_1]` on the table `Customer` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Customer_address_1_key" ON "Customer"("address_1");
