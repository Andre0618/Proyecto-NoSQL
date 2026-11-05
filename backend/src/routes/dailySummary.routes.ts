import { Router } from "express"
import { closeDay, getPeriod, clearSummaries, getSummaryChart, getDailySummaryHistory, deleteDailySummary } from "../controllers/dailySummary.controller"
import { downloadSummaryPDF, downloadTodayPDF } from "../controllers/pdf.controller"
import { authMiddleware, adminOnly } from "../middlewares/auth.middleware"
import { sameRestaurant } from "../middlewares/tenant.middleware"
import { requireFeature } from "../middlewares/feature.middleware"

const router = Router()

router.post("/close", authMiddleware, adminOnly, sameRestaurant, closeDay)
router.get("/pdf/day/:restaurantId", authMiddleware, adminOnly, requireFeature("pdf_reports"), sameRestaurant, downloadTodayPDF)
router.get("/pdf/:restaurantId", authMiddleware, adminOnly, requireFeature("pdf_reports"), sameRestaurant, downloadSummaryPDF)
router.get("/period/:restaurantId", authMiddleware, adminOnly, sameRestaurant, getPeriod)
router.get("/chart/:restaurantId", authMiddleware, adminOnly, sameRestaurant, getSummaryChart)
router.get("/history/:restaurantId", authMiddleware, adminOnly, sameRestaurant, getDailySummaryHistory)

router.delete("/entry/:id", authMiddleware, adminOnly, deleteDailySummary)
router.delete("/:restaurantId", authMiddleware, adminOnly, sameRestaurant, clearSummaries)

export default router
