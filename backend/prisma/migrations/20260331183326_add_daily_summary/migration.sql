-- CreateTable
CREATE TABLE "DailySummary" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "totalIngresos" DOUBLE PRECISION NOT NULL,
    "totalOrdenes" INTEGER NOT NULL,
    "totalPlatos" INTEGER NOT NULL,
    "efectivo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "datafono" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nequi" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "restaurantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailySummary_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "DailySummary" ADD CONSTRAINT "DailySummary_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
