import { Request, Response } from "express"
import { prisma, type Tx } from "../lib/prisma"
import { CreateOrderSchema, AddItemSchema, CloseOrderSchema } from "../lib/validators"
import { asyncHandler } from "../lib/asyncHandler"
import { BusinessError, HTTP } from "../lib/errors"
import { getOpenPeriod, closedSince } from "../lib/period"
import { audit } from "../lib/audit"
import { lockClose } from "../lib/locks"
import { getTenantConfig } from "../lib/tenantConfig"

// 5 s se quedan cortos cuando la base está en otra región
const TX = { timeout: 20_000, maxWait: 10_000 }

// Toma la orden (la bloquea hasta terminar la transacción) solo si sigue abierta. Si otra petición la cerró o
// la canceló un instante antes, esta falla en vez de repetir el efecto (devolver el stock dos veces, etc.).
const lockOpenOrder = async (tx: Tx, id: string) => {
  const taken = await tx.order.updateMany({
    where: { id, status: "ABIERTA" },
    data: { total: { increment: 0 } },
  })
  if (taken.count === 0) throw new BusinessError("ORDER_NOT_OPEN")
}

export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  const data = CreateOrderSchema.parse(req.body)
  const userId = req.user?.userId
  if (!userId) throw new BusinessError("UNAUTHENTICATED")

  if (data.tableId) {
    const table = await prisma.table.findUnique({
      where: { id: data.tableId },
      select: { restaurantId: true },
    })
    if (!table || table.restaurantId !== data.restaurantId) {
      throw new BusinessError("FORBIDDEN")
    }
  }

  if (data.tableId) {
    const open = await prisma.order.findFirst({
      where: { tableId: data.tableId, restaurantId: data.restaurantId, status: "ABIERTA" },
      include: { items: { include: { product: true } } },
    })
    if (open) return res.status(HTTP.OK).json(open)
  }

  const order = await prisma.order.create({
    data: {
      tableId: data.tableId ?? null,
      restaurantId: data.restaurantId,
      userId,
      total: 0,
      status: "ABIERTA",
    },
  })

  return res.status(HTTP.CREATED).json(order)
})

export const getOrderById = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string
  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: { include: { product: true } }, table: true },
  })
  if (!order) throw new BusinessError("ORDER_NOT_FOUND")
  if (order.restaurantId !== req.user?.restaurantId) {
    throw new BusinessError("FORBIDDEN")
  }
  return res.json(order)
})

export const getActiveOrderByTable = asyncHandler(async (req: Request, res: Response) => {
  const tableId = req.params.tableId as string
  const order = await prisma.order.findFirst({
    where: { tableId, status: "ABIERTA" },
    include: { items: { include: { product: true } } },
  })
  if (order && order.restaurantId !== req.user?.restaurantId) {
    throw new BusinessError("FORBIDDEN")
  }
  return res.json(order)
})

export const addItemToOrder = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string
  const { productId, quantity } = AddItemSchema.parse(req.body)

  const order = await prisma.order.findUnique({
    where: { id },
    select: { restaurantId: true, tableId: true, status: true },
  })
  if (!order) throw new BusinessError("ORDER_NOT_FOUND")
  if (order.restaurantId !== req.user?.restaurantId) {
    throw new BusinessError("FORBIDDEN")
  }
  if (order.status !== "ABIERTA") throw new BusinessError("ORDER_NOT_OPEN")

  const item = await prisma.$transaction(async (tx) => {
    await lockOpenOrder(tx, id)

    const product = await tx.product.findUnique({ where: { id: productId } })
    if (!product) throw new BusinessError("PRODUCT_NOT_FOUND")
    if (product.restaurantId !== order.restaurantId) {
      throw new BusinessError("PRODUCT_FOREIGN")
    }

    // descuento atómico: si dos meseros piden lo último, solo uno lo consigue
    const decremented = await tx.product.updateMany({
      where: { id: productId, stock: { gte: quantity } },
      data: { stock: { decrement: quantity } },
    })
    if (decremented.count === 0) {
      const current = await tx.product.findUnique({ where: { id: productId }, select: { stock: true } })
      throw new BusinessError("INSUFFICIENT_STOCK", { available: current?.stock ?? 0 })
    }

    const existing = await tx.orderItem.findFirst({ where: { orderId: id, productId } })

    const saved = existing
      ? await tx.orderItem.update({
          where: { id: existing.id },
          data: { quantity: { increment: quantity } },
          include: { product: true },
        })
      : await tx.orderItem.create({
          data: { orderId: id, productId, quantity, unitPrice: product.price },
          include: { product: true },
        })

    const allItems = await tx.orderItem.findMany({ where: { orderId: id } })
    const total = allItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
    await tx.order.update({ where: { id }, data: { total } })

    if (order.tableId) {
      await tx.table.update({ where: { id: order.tableId }, data: { status: "OCUPADA" } })
    }

    return saved
  }, TX)

  return res.status(HTTP.CREATED).json(item)
})

export const closeOrder = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string
  const { paymentMethod, tip = 0, cashAmount, transferMethod } = CloseOrderSchema.parse(req.body)
  const mixed = paymentMethod === "Mixto"

  const restaurantId = req.user?.restaurantId
  if (!restaurantId) throw new BusinessError("UNAUTHENTICATED")
  const { paymentMethods } = (await getTenantConfig(restaurantId)).settings
  if (!paymentMethods.includes(paymentMethod) || (mixed && transferMethod && !paymentMethods.includes(transferMethod))) {
    throw new BusinessError("PAYMENT_METHOD_DISABLED")
  }

  const existing = await prisma.order.findUnique({
    where: { id },
    select: { restaurantId: true, status: true, _count: { select: { items: true } } },
  })
  if (!existing) throw new BusinessError("ORDER_NOT_FOUND")
  if (existing.restaurantId !== req.user?.restaurantId) {
    throw new BusinessError("FORBIDDEN")
  }
  if (existing.status !== "ABIERTA") throw new BusinessError("ORDER_NOT_OPEN")
  if (existing._count.items === 0) throw new BusinessError("ORDER_EMPTY")

  const order = await prisma.$transaction(async (tx) => {
    // espera a que termine un cierre de día en curso; así closedAt siempre cae en el periodo correcto
    await lockClose(tx, existing.restaurantId, "shared")

    const closed = await tx.order.updateMany({
      where: { id, restaurantId: existing.restaurantId, status: "ABIERTA" },
      data: {
        status: "CERRADA", paymentMethod, tip, closedAt: new Date(),
        cashAmount: mixed ? cashAmount : null,
        transferMethod: mixed ? transferMethod : null,
      },
    })
    if (closed.count === 0) throw new BusinessError("ORDER_NOT_OPEN")

    const updated = await tx.order.findUniqueOrThrow({
      where: { id },
      include: { items: { include: { product: true } }, table: true },
    })
    if (updated.items.length === 0) throw new BusinessError("ORDER_EMPTY")
    // el total se confirma ya con la orden bloqueada; si no cuadra, no se cobra nada
    if (mixed && (cashAmount === undefined || !transferMethod || cashAmount <= 0 || cashAmount >= updated.total)) {
      throw new BusinessError("INVALID_SPLIT")
    }
    if (updated.tableId) {
      await tx.table.update({
        where: { id: updated.tableId },
        data: { status: "DISPONIBLE" },
      })
    }
    return updated
  }, TX)

  return res.json(order)
})

export const cancelOrder = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string

  const order = await prisma.order.findUnique({
    where: { id },
    select: { restaurantId: true, tableId: true, status: true },
  })
  if (!order) throw new BusinessError("ORDER_NOT_FOUND")
  if (order.restaurantId !== req.user?.restaurantId) {
    throw new BusinessError("FORBIDDEN")
  }
  if (order.status !== "ABIERTA") throw new BusinessError("ORDER_NOT_OPEN")

  const restocked = await prisma.$transaction(async (tx) => {
    await lockOpenOrder(tx, id)
    await tx.order.update({ where: { id }, data: { status: "CANCELADA" } })

    // los productos se leen ya con la orden bloqueada, así no se devuelve de más ni de menos
    // siempre en el mismo orden, para que dos cancelaciones a la vez no se bloqueen entre sí
    const items = await tx.orderItem.findMany({
      where: { orderId: id },
      select: { productId: true, quantity: true },
      orderBy: { productId: "asc" },
    })
    for (const item of items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } },
      })
    }
    if (order.tableId) {
      await tx.table.update({ where: { id: order.tableId }, data: { status: "DISPONIBLE" } })
    }
    return items.length
  }, TX)

  audit(req, "order.cancel", { orderId: id, items: restocked })
  return res.json({ message: "Orden cancelada" })
})

export const removeItemFromOrder = asyncHandler(async (req: Request, res: Response) => {
  const itemId = req.params.itemId as string

  const item = await prisma.orderItem.findUnique({
    where: { id: itemId },
    include: { order: { select: { restaurantId: true, status: true, tableId: true } } },
  })
  if (!item) throw new BusinessError("RESOURCE_NOT_FOUND")
  if (item.order.restaurantId !== req.user?.restaurantId) {
    throw new BusinessError("FORBIDDEN")
  }
  if (item.order.status !== "ABIERTA") throw new BusinessError("ORDER_NOT_OPEN")

  await prisma.$transaction(async (tx) => {
    await lockOpenOrder(tx, item.orderId)

    // se vuelve a leer con la orden bloqueada: si otro ya lo quitó, no se devuelve el stock otra vez
    const current = await tx.orderItem.findUnique({ where: { id: itemId }, select: { productId: true, quantity: true } })
    if (!current) throw new BusinessError("RESOURCE_NOT_FOUND")

    await tx.orderItem.delete({ where: { id: itemId } })
    await tx.product.update({
      where: { id: current.productId },
      data: { stock: { increment: current.quantity } },
    })
    const allItems = await tx.orderItem.findMany({ where: { orderId: item.orderId } })
    const total = allItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
    await tx.order.update({ where: { id: item.orderId }, data: { total } })

    // sin productos, la mesa queda libre
    if (allItems.length === 0 && item.order.tableId) {
      await tx.table.update({ where: { id: item.order.tableId }, data: { status: "DISPONIBLE" } })
    }
  }, TX)

  return res.json({ message: "Ítem eliminado" })
})

export const getOrderHistory = asyncHandler(async (req: Request, res: Response) => {
  const restaurantId = req.params.restaurantId as string
  const { from } = await getOpenPeriod(restaurantId)
  const orders = await prisma.order.findMany({
    where: { restaurantId, ...closedSince(from) },
    orderBy: { createdAt: "desc" },
    include: { table: true, items: { include: { product: true } } },
  })
  return res.json(orders)
})

export const getDashboardStats = asyncHandler(async (req: Request, res: Response) => {
  const restaurantId = req.params.restaurantId as string

  const { from, lastCloseAt } = await getOpenPeriod(restaurantId)
  const ordersToday = await prisma.order.findMany({
    where: { restaurantId, ...closedSince(from) },
    include: { items: { select: { quantity: true } } },
  })
  const tables = await prisma.table.findMany({ where: { restaurantId } })

  const totalIngresos = ordersToday.reduce((sum, o) => sum + o.total, 0)
  const totalPropinas = ordersToday.reduce((sum, o) => sum + (o.tip ?? 0), 0)

  return res.json({
    totalIngresos,
    totalPropinas,
    totalRecibido: totalIngresos + totalPropinas,
    totalPedidos:  ordersToday.length,
    totalPlatos:   ordersToday.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0),
    mesasOcupadas: tables.filter(t => t.status === "OCUPADA").length,
    totalMesas:    tables.length,
    periodStart:   from,
    lastCloseAt,
  })
})
