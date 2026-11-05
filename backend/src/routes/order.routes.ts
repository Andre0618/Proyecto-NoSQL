import { Router } from "express"
import {
  createOrder,
  getOrderById,
  getActiveOrderByTable,
  addItemToOrder,
  closeOrder,
  removeItemFromOrder,
  cancelOrder,
  getOrderHistory,
  getDashboardStats
} from "../controllers/order.controller"
import { authMiddleware, adminOnly } from "../middlewares/auth.middleware"
import { sameRestaurant } from "../middlewares/tenant.middleware"

const router = Router()

router.post("/", authMiddleware, sameRestaurant, createOrder)

router.get("/history/:restaurantId", authMiddleware, adminOnly, sameRestaurant, getOrderHistory)
router.get("/stats/:restaurantId", authMiddleware, adminOnly, sameRestaurant, getDashboardStats)
router.get("/table/:tableId", authMiddleware, getActiveOrderByTable)

router.get("/:id", authMiddleware, getOrderById)

router.post("/:id/items", authMiddleware, addItemToOrder)
router.patch("/:id/close", authMiddleware, closeOrder)
router.patch("/:id/cancel", authMiddleware, cancelOrder)
router.delete("/items/:itemId", authMiddleware, removeItemFromOrder)

export default router
