import { Request, Response } from "express"
import { HTTP, BusinessError } from "../lib/errors"
import { TableStatus } from "@prisma/client"
import { prisma } from "../lib/prisma"
import { TableSchema } from "../lib/validators"
import { asyncHandler } from "../lib/asyncHandler"
import { audit } from "../lib/audit"

export const getTables = asyncHandler(async (req: Request, res: Response) => {
  const restaurantId = req.params.restaurantId as string
  const tables = await prisma.table.findMany({
    where: { restaurantId },
    orderBy: { number: "asc" },
    include: { orders: { where: { status: "ABIERTA" }, take: 1 } },
  })
  return res.json(tables)
})

export const createTable = asyncHandler(async (req: Request, res: Response) => {
  const data = TableSchema.parse(req.body)
  const exists = await prisma.table.findFirst({ where: { restaurantId: data.restaurantId, number: data.number }, select: { id: true } })
  if (exists) throw new BusinessError("DUPLICATE", { message: `Ya existe la mesa ${data.number}.` })
  const table = await prisma.table.create({ data })
  return res.status(HTTP.CREATED).json(table)
})

export const updateTableStatus = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string
  const { status } = req.body as { status: TableStatus }
  if (status !== "DISPONIBLE" && status !== "OCUPADA") {
    throw new BusinessError("VALIDATION_ERROR", { message: "Estado inválido." })
  }
  const table = await prisma.table.update({ where: { id }, data: { status } })
  return res.json(table)
})

export const deleteTable = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string
  await prisma.table.delete({ where: { id } })
  audit(req, "table.delete", { tableId: id })
  return res.json({ message: "Mesa eliminada" })
})
