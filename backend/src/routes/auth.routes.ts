import { Router } from "express"
import rateLimit from "express-rate-limit"
import { login, createEmployee, listUsers, deleteUser, changeOwnPassword, resetEmployeePassword } from "../controllers/auth.controller"
import { authMiddleware, adminOnly } from "../middlewares/auth.middleware"
import { sameRestaurant } from "../middlewares/tenant.middleware"

const router = Router()

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  // solo cuentan los fallidos, así varios empleados en el mismo wifi no se bloquean entre sí
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiados intentos. Intenta más tarde." },
})

const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiados intentos. Intenta más tarde." },
})

router.post("/login", loginLimiter, login)
router.patch("/password", passwordLimiter, authMiddleware, changeOwnPassword)
router.patch("/users/:userId/password", authMiddleware, adminOnly, resetEmployeePassword)
router.post("/employees", authMiddleware, adminOnly, createEmployee)
router.get("/users/:restaurantId", authMiddleware, adminOnly, sameRestaurant, listUsers)
router.delete("/users/:userId", authMiddleware, adminOnly, deleteUser)

export default router
