/*
  Warnings:

  - A unique constraint covering the columns `[restaurantId,date]` on the table `DailySummary` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "DailySummary" ADD COLUMN     "totalPropinas" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "DailySummary_restaurantId_date_key" ON "DailySummary"("restaurantId", "date");
