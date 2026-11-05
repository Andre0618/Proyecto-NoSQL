import { Router } from "express"
import { getTables, createTable, updateTableStatus, deleteTable } from "../controllers/table.controller"
import { authMiddleware, adminOnly } from "../middlewares/auth.middleware"
import { sameRestaurant, ownsResource } from "../middlewares/tenant.middleware"
import { prisma } from "../lib/prisma"

const router = Router()

const tableOwner = ownsResource((id) =>
  prisma.table.findUnique({ where: { id }, select: { restaurantId: true } })
)

router.get("/:restaurantId", authMiddleware, sameRestaurant, getTables)
router.post("/", authMiddleware, adminOnly, sameRestaurant, createTable)
router.patch("/:id/status", authMiddleware, adminOnly, tableOwner, updateTableStatus)
router.delete("/:id", authMiddleware, adminOnly, tableOwner, deleteTable)

export default router
