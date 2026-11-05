import { Request, Response } from "express"
import { prisma } from "../lib/prisma"
import { EmployeePaymentSchema } from "../lib/validators"
import { getOpenPeriod } from "../lib/period"
import { asyncHandler } from "../lib/asyncHandler"
import { BusinessError, HTTP } from "../lib/errors"
import { audit } from "../lib/audit"

export const createEmployeePayment = asyncHandler(async (req: Request, res: Response) => {
  const data = EmployeePaymentSchema.parse(req.body)

  const targetUser = await prisma.user.findUnique({
    where: { id: data.userId },
    select: { restaurantId: true },
  })
  if (!targetUser || targetUser.restaurantId !== data.restaurantId) {
    throw new BusinessError("FORBIDDEN")
  }

  const payment = await prisma.employeePayment.create({
    data: {
      userId: data.userId,
      restaurantId: data.restaurantId,
      salary: data.salary,
      tip: data.tip ?? 0,
      paymentMethod: data.paymentMethod,
      notes: data.notes ?? null,
    },
    include: { user: { select: { name: true, role: true } } },
  })
  return res.status(HTTP.CREATED).json(payment)
})

export const getPeriodPayments = asyncHandler(async (req: Request, res: Response) => {
  const restaurantId = req.params.restaurantId as string
  const { from } = await getOpenPeriod(restaurantId)
  const payments = await prisma.employeePayment.findMany({
    where: { restaurantId, createdAt: { gt: from } },
    include: { user: { select: { name: true, role: true } } },
    orderBy: { createdAt: "asc" },
  })
  return res.json(payments)
})

export const deleteEmployeePayment = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string
  const payment = await prisma.employeePayment.findUnique({
    where: { id },
    select: { restaurantId: true },
  })
  if (!payment) throw new BusinessError("RESOURCE_NOT_FOUND")
  if (payment.restaurantId !== req.user?.restaurantId) {
    throw new BusinessError("FORBIDDEN")
  }
  await prisma.employeePayment.delete({ where: { id } })
  audit(req, "payment.delete", { paymentId: id })
  return res.json({ message: "Pago eliminado" })
})
