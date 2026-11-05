import { Router } from "express"
import { getCategories, createCategory, deleteCategory } from "../controllers/category.controller"
import { authMiddleware, adminOnly } from "../middlewares/auth.middleware"
import { sameRestaurant, ownsResource } from "../middlewares/tenant.middleware"
import { prisma } from "../lib/prisma"

const router = Router()

const categoryOwner = ownsResource((id) =>
  prisma.category.findUnique({ where: { id }, select: { restaurantId: true } })
)

router.get("/:restaurantId", authMiddleware, sameRestaurant, getCategories)
router.post("/", authMiddleware, adminOnly, sameRestaurant, createCategory)
router.delete("/:id", authMiddleware, adminOnly, categoryOwner, deleteCategory)

export default router
