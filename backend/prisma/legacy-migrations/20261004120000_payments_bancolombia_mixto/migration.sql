-- El datáfono se reemplaza por Bancolombia: se renombra la columna para conservar lo ya registrado
ALTER TABLE "DailySummary" RENAME COLUMN "datafono" TO "bancolombia";

-- Compras y gastos pagados en efectivo, para el cierre de caja
ALTER TABLE "DailySummary" ADD COLUMN     "comprasEfectivo" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "gastosEfectivo" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Pago mixto: cuánto fue en efectivo y por cuál medio se pagó el resto
ALTER TABLE "Order" ADD COLUMN     "cashAmount" DOUBLE PRECISION,
ADD COLUMN     "transferMethod" TEXT;
