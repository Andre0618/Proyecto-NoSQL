import { Router } from "express"
import {
  createCashMovement,
  getCashMovementsByRestaurant,
  deleteCashMovement,
} from "../controllers/cashMovement.controller"
import { authMiddleware, adminOnly } from "../middlewares/auth.middleware"
import { sameRestaurant, ownsResource } from "../middlewares/tenant.middleware"
import { requireFeature } from "../middlewares/feature.middleware"
import { prisma } from "../lib/prisma"

const router = Router()

const movementOwner = ownsResource((id) =>
  prisma.cashMovement.findUnique({ where: { id }, select: { restaurantId: true } })
)

const cash = requireFeature("cash_management")

router.post("/", authMiddleware, adminOnly, cash, sameRestaurant, createCashMovement)
router.get("/:restaurantId", authMiddleware, adminOnly, cash, sameRestaurant, getCashMovementsByRestaurant)
router.delete("/:id", authMiddleware, adminOnly, cash, movementOwner, deleteCashMovement)

export default router
