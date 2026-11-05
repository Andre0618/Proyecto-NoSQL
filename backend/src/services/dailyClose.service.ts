import { DailySummary } from "@prisma/client"
import { prisma } from "../lib/prisma"
import { colombiaDayStart } from "../lib/date"
import { getOpenPeriod, closedSince } from "../lib/period"
import { BusinessError } from "../lib/errors"
import { env } from "../lib/env"
import { lockClose } from "../lib/locks"
import { sumPayments } from "../lib/payments"

export type CloseDayResult =
  | { kind: "created"; summary: DailySummary }
  | { kind: "updated"; summary: DailySummary }

// Cierra lo que pasó desde el último cierre. El resumen lleva la fecha del primer movimiento, así un cierre
// de madrugada de un turno de ayer queda como el de ayer; si esa fecha ya tenía resumen, se le suma.
// Las propinas van aparte: no cuentan como ingreso.
export const closeDayForRestaurant = async (restaurantId: string): Promise<CloseDayResult> => {
  return prisma.$transaction(async (tx) => {
    // dos cierres a la vez (doble clic, dos dispositivos) no se pisan: el segundo espera y ya no encuentra nada
    await lockClose(tx, restaurantId, "exclusive")

    const { from } = await getOpenPeriod(restaurantId, tx)
    const after = { gt: from }

    const orders = await tx.order.findMany({
      where: { restaurantId, ...closedSince(from) },
      include: { items: { select: { quantity: true } } },
    })

    const [baseAgg, gastosAgg, comprasAgg, gastosEfAgg, comprasEfAgg, pagosAgg, pagosEfAgg, firstMovement, firstPayment] = await Promise.all([
      tx.cashMovement.aggregate({ where: { restaurantId, type: "BASE_CAJA", createdAt: after }, _sum: { amount: true } }),
      tx.cashMovement.aggregate({ where: { restaurantId, type: "GASTO", createdAt: after }, _sum: { amount: true } }),
      tx.cashMovement.aggregate({ where: { restaurantId, type: "COMPRA", createdAt: after }, _sum: { amount: true } }),
      tx.cashMovement.aggregate({ where: { restaurantId, type: "GASTO", paymentMethod: "Efectivo", createdAt: after }, _sum: { amount: true } }),
      tx.cashMovement.aggregate({ where: { restaurantId, type: "COMPRA", paymentMethod: "Efectivo", createdAt: after }, _sum: { amount: true } }),
      tx.employeePayment.aggregate({ where: { restaurantId, createdAt: after }, _sum: { salary: true, tip: true } }),
      tx.employeePayment.aggregate({ where: { restaurantId, paymentMethod: "Efectivo", createdAt: after }, _sum: { salary: true, tip: true } }),
      tx.cashMovement.findFirst({ where: { restaurantId, createdAt: after }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
      tx.employeePayment.findFirst({ where: { restaurantId, createdAt: after }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    ])

    const baseCaja            = baseAgg._sum.amount ?? 0
    const totalGastos         = gastosAgg._sum.amount ?? 0
    const totalCompras        = comprasAgg._sum.amount ?? 0
    const gastosEfectivo      = gastosEfAgg._sum.amount ?? 0
    const comprasEfectivo     = comprasEfAgg._sum.amount ?? 0
    const totalPagosEmpleados = pagosAgg._sum.salary ?? 0
    const propinasEntregadas  = pagosAgg._sum.tip ?? 0
    const sueldosEfectivo            = pagosEfAgg._sum.salary ?? 0
    const propinasEntregadasEfectivo = pagosEfAgg._sum.tip ?? 0

    const nothingToClose =
      orders.length === 0 && baseCaja === 0 && totalGastos === 0 &&
      totalCompras === 0 && totalPagosEmpleados === 0 && propinasEntregadas === 0
    if (nothingToClose) throw new BusinessError("EMPTY_DAY")

    const moments = [
      ...orders.map(o => (o.closedAt ?? o.createdAt).getTime()),
      firstMovement?.createdAt.getTime(),
      firstPayment?.createdAt.getTime(),
    ].filter((t): t is number => typeof t === "number")
    const date = colombiaDayStart(new Date(moments.length ? Math.min(...moments) : Date.now()))

    const porMedio = sumPayments(orders)
    const ventas = orders.reduce((s, o) => s + o.total, 0)

    const data = {
      totalIngresos: ventas + baseCaja - totalGastos - totalCompras - totalPagosEmpleados,
      totalOrdenes:  orders.length,
      totalPlatos:   orders.reduce((s, o) => s + o.items.reduce((q, i) => q + i.quantity, 0), 0),
      totalPropinas: orders.reduce((s, o) => s + (o.tip ?? 0), 0),
      efectivo:    porMedio.efectivo,
      bancolombia: porMedio.bancolombia,
      nequi:       porMedio.nequi,
      totalGastos,
      totalCompras,
      gastosEfectivo,
      comprasEfectivo,
      totalPagosEmpleados,
      propinasEntregadas,
      sueldosEfectivo,
      propinasEntregadasEfectivo,
      baseCaja,
    }

    const existing = await tx.dailySummary.findUnique({
      where: { restaurantId_date: { restaurantId, date } },
    })

    const summary = existing
      ? await tx.dailySummary.update({
          where: { id: existing.id },
          data: {
            totalIngresos:       { increment: data.totalIngresos },
            totalOrdenes:        { increment: data.totalOrdenes },
            totalPlatos:         { increment: data.totalPlatos },
            totalPropinas:       { increment: data.totalPropinas },
            efectivo:            { increment: data.efectivo },
            bancolombia:         { increment: data.bancolombia },
            nequi:               { increment: data.nequi },
            totalGastos:         { increment: data.totalGastos },
            totalCompras:        { increment: data.totalCompras },
            gastosEfectivo:      { increment: data.gastosEfectivo },
            comprasEfectivo:     { increment: data.comprasEfectivo },
            totalPagosEmpleados: { increment: data.totalPagosEmpleados },
            propinasEntregadas:  { increment: data.propinasEntregadas },
            sueldosEfectivo:     { increment: data.sueldosEfectivo },
            propinasEntregadasEfectivo: { increment: data.propinasEntregadasEfectivo },
            baseCaja:            { increment: data.baseCaja },
            // hora del último cierre: desde aquí empieza el siguiente periodo
            createdAt: new Date(),
          },
        })
      : await tx.dailySummary.create({ data: { ...data, date, restaurantId } })

    if (orders.length > 0) {
      await tx.order.updateMany({
        where: { id: { in: orders.map(o => o.id) } },
        data: { status: "ARCHIVADA" },
      })
    }

    return { kind: existing ? ("updated" as const) : ("created" as const), summary }
  }, { timeout: 30_000, maxWait: 10_000 })
}

// Borra órdenes archivadas viejas; los cierres no se tocan. Sin la variable no hace nada.
export const purgeOldArchivedOrders = async (restaurantId: string): Promise<number> => {
  const days = env.archiveRetentionDays
  if (!days || !Number.isFinite(days) || days < 7) return 0
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const { count } = await prisma.order.deleteMany({
    where: { restaurantId, status: "ARCHIVADA", createdAt: { lt: cutoff } },
  })
  return count
}
