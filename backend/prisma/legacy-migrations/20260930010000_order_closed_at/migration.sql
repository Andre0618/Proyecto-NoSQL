-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "closedAt" TIMESTAMP(3);

-- Las órdenes ya cerradas conservan su fecha de creación como fecha de cierre
UPDATE "Order" SET "closedAt" = "createdAt" WHERE "status" IN ('CERRADA', 'ARCHIVADA') AND "closedAt" IS NULL;

-- CreateIndex
CREATE INDEX "Order_restaurantId_closedAt_idx" ON "Order"("restaurantId", "closedAt");
