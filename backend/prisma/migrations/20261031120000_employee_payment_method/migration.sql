-- Con qué se le pagó a cada empleado. Los pagos ya registrados quedan como efectivo, que es lo habitual.
ALTER TABLE "EmployeePayment" ADD COLUMN     "paymentMethod" TEXT NOT NULL DEFAULT 'Efectivo';

-- Sueldos y propinas pagados con efectivo de la caja, para descontarlos en el cierre de caja
ALTER TABLE "DailySummary" ADD COLUMN     "sueldosEfectivo" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "propinasEntregadasEfectivo" DOUBLE PRECISION NOT NULL DEFAULT 0;
