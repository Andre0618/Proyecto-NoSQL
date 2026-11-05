import { Request, Response } from "express"
import { prisma } from "../lib/prisma"
import { CashMovementSchema } from "../lib/validators"
import { asyncHandler } from "../lib/asyncHandler"
import { BusinessError, HTTP } from "../lib/errors"
import { getOpenPeriod } from "../lib/period"
import { audit } from "../lib/audit"

export const createCashMovement = asyncHandler(async (req: Request, res: Response) => {
  const data = CashMovementSchema.parse(req.body)

  if (data.type === "BASE_CAJA") {
    const { from } = await getOpenPeriod(data.restaurantId)
    const existingBase = await prisma.cashMovement.findFirst({
      where: {
        restaurantId: data.restaurantId,
        type: "BASE_CAJA",
        createdAt: { gt: from },
      },
    })
    if (existingBase) throw new BusinessError("DUPLICATE_BASE_CAJA")
  }

  const movement = await prisma.cashMovement.create({
    data: {
      type: data.type,
      concept: data.concept,
      amount: data.amount,
      paymentMethod: data.paymentMethod ?? null,
      notes: data.notes ?? null,
      restaurantId: data.restaurantId,
    },
  })

  return res.status(HTTP.CREATED).json(movement)
})

export const getCashMovementsByRestaurant = asyncHandler(async (req: Request, res: Response) => {
  const restaurantId = req.params.restaurantId as string
  const movements = await prisma.cashMovement.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
  })
  return res.json(movements)
})

export const deleteCashMovement = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string
  await prisma.cashMovement.delete({ where: { id } })
  audit(req, "cash.delete", { movementId: id })
  return res.json({ message: "Movimiento eliminado correctamente" })
})
