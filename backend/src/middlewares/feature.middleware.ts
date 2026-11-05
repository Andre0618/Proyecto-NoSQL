import { Request, Response, NextFunction } from "express"
import { sendError } from "../lib/errors"
import { getTenantConfig } from "../lib/tenantConfig"
import type { Feature } from "../lib/entitlements"

// Va después de authMiddleware: deja pasar solo si el plan del restaurante (o una excepción suya) incluye la funcionalidad
export const requireFeature = (feature: Feature) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const restaurantId = req.user?.restaurantId
      if (!restaurantId) return sendError(res, "UNAUTHENTICATED")

      const { features } = await getTenantConfig(restaurantId)
      if (!features.includes(feature)) return sendError(res, "FEATURE_DISABLED", { feature })

      next()
    } catch (error) {
      next(error)
    }
  }
