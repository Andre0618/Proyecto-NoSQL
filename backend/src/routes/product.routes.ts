import { Router } from "express"
import { getProducts, createProduct, updateProduct, deleteProduct } from "../controllers/product.controller"
import { authMiddleware, adminOnly } from "../middlewares/auth.middleware"
import { sameRestaurant, ownsResource } from "../middlewares/tenant.middleware"
import { prisma } from "../lib/prisma"

const router = Router()

const productOwner = ownsResource((id) =>
  prisma.product.findUnique({ where: { id }, select: { restaurantId: true } })
)

router.get("/:restaurantId", authMiddleware, sameRestaurant, getProducts)
router.post("/", authMiddleware, adminOnly, sameRestaurant, createProduct)
router.put("/:id", authMiddleware, adminOnly, productOwner, updateProduct)
router.delete("/:id", authMiddleware, adminOnly, productOwner, deleteProduct)

export default router
