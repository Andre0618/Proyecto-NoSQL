import { Request, Response } from "express"
import { z } from "zod"
import { prisma } from "../lib/prisma"
import { getColombiaDayRange } from "../lib/date"
import { getOpenPeriod } from "../lib/period"
import { asyncHandler } from "../lib/asyncHandler"
import { BusinessError, HTTP } from "../lib/errors"
import { closeDayForRestaurant, purgeOldArchivedOrders } from "../services/dailyClose.service"
import { audit } from "../lib/audit"

export const closeDay = asyncHandler(async (req: Request, res: Response) => {
  const restaurantId = (req.user?.restaurantId ?? req.body.restaurantId) as string
  const result = await closeDayForRestaurant(restaurantId)
  audit(req, "day.close", { kind: result.kind, orders: result.summary.totalOrdenes, net: result.summary.totalIngresos })

  // limpieza opcional (ARCHIVE_RETENTION_DAYS); si falla, el cierre ya quedó hecho
  purgeOldArchivedOrders(restaurantId).catch(err => console.error("No se pudo limpiar órdenes archivadas", err))

  if (result.kind === "updated") {
    return res.status(HTTP.OK).json({ message: "Cierre del día actualizado.", summary: result.summary, updated: true })
  }
  return res.status(HTTP.CREATED).json({ message: "Día cerrado correctamente.", summary: result.summary })
})

export const getPeriod = asyncHandler(async (req: Request, res: Response) => {
  const restaurantId = req.params.restaurantId as string
  const { from, lastCloseAt } = await getOpenPeriod(restaurantId)
  return res.json({ from, lastCloseAt })
})

const ResetSchema = z.object({ until: z.coerce.date() })

// Borra solo lo que trae el PDF (hasta `until`); lo registrado después se queda
export const clearSummaries = asyncHandler(async (req: Request, res: Response) => {
  const restaurantId = req.params.restaurantId as string
  const { until } = ResetSchema.parse(req.query)

  const deleted = await prisma.$transaction(async (tx) => {
    const movements = await tx.cashMovement.deleteMany({ where: { restaurantId, createdAt: { lte: until } } })
    const payments  = await tx.employeePayment.deleteMany({ where: { restaurantId, createdAt: { lte: until } } })
    const orders    = await tx.order.deleteMany({ where: { restaurantId, status: "ARCHIVADA", createdAt: { lte: until } } })
    const summaries = await tx.dailySummary.deleteMany({ where: { restaurantId, createdAt: { lte: until } } })
    return { movements: movements.count, payments: payments.count, orders: orders.count, summaries: summaries.count }
  }, { timeout: 30_000, maxWait: 10_000 })

  audit(req, "history.reset", { until: until.toISOString(), deleted })
  return res.json({ message: "Historial reiniciado.", deleted })
})

export const getSummaryChart = asyncHandler(async (req: Request, res: Response) => {
  const restaurantId = req.params.restaurantId as string
  const period = (req.query.period as string) || "week"
  const { today, tomorrow } = getColombiaDayRange()

  const startDate = new Date(today)
  startDate.setUTCDate(startDate.getUTCDate() - (period === "month" ? 29 : 6))

  const summaries = await prisma.dailySummary.findMany({
    where: { restaurantId, date: { gte: startDate, lt: tomorrow } },
    orderBy: { date: "asc" },
  })

  const fmtCO = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
  })

  const data = summaries.map((item) => {
    const slice = fmtCO.format(item.date)
    const [, month, day] = slice.split("-")
    return {
      date:      slice,
      day:       `${day}/${month}`,
      pedidos:   item.totalOrdenes,
      ingresos:  item.totalIngresos,
      platos:    item.totalPlatos,
      propinas:  item.totalPropinas ?? 0,
      baseCaja:  item.baseCaja ?? 0,
      efectivo:  item.efectivo,
      bancolombia: item.bancolombia,
      nequi:     item.nequi,
    }
  })

  return res.json(data)
})

export const deleteDailySummary = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string
  const summary = await prisma.dailySummary.findUnique({
    where: { id },
    select: { restaurantId: true },
  })
  if (!summary) throw new BusinessError("RESOURCE_NOT_FOUND")
  if (summary.restaurantId !== req.user?.restaurantId) {
    throw new BusinessError("FORBIDDEN")
  }
  await prisma.dailySummary.delete({ where: { id } })
  audit(req, "summary.delete", { summaryId: id })
  return res.json({ message: "Resumen eliminado" })
})

export const getDailySummaryHistory = asyncHandler(async (req: Request, res: Response) => {
  const restaurantId = req.params.restaurantId as string
  const summaries = await prisma.dailySummary.findMany({
    where: { restaurantId },
    orderBy: { date: "desc" },
  })
  return res.json(summaries)
})
