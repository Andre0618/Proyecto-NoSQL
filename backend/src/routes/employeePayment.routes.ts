import { Router } from "express"
import { createEmployeePayment, getPeriodPayments, deleteEmployeePayment } from "../controllers/employeePayment.controller"
import { authMiddleware, adminOnly } from "../middlewares/auth.middleware"
import { sameRestaurant } from "../middlewares/tenant.middleware"
import { requireFeature } from "../middlewares/feature.middleware"

const router = Router()

// los pagos a empleados salen de la caja del día: van con las compras y gastos
const cash = requireFeature("cash_management")

router.post("/", authMiddleware, adminOnly, cash, sameRestaurant, createEmployeePayment)
router.get("/:restaurantId", authMiddleware, adminOnly, cash, sameRestaurant, getPeriodPayments)
router.delete("/:id", authMiddleware, adminOnly, cash, deleteEmployeePayment)

export default router
