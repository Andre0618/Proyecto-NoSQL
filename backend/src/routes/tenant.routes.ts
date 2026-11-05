import { Router } from "express"
import { getTenant, updateSettings } from "../controllers/tenant.controller"
import { authMiddleware, adminOnly } from "../middlewares/auth.middleware"

const router = Router()

router.get("/", authMiddleware, getTenant)
router.patch("/settings", authMiddleware, adminOnly, updateSettings)

export default router
