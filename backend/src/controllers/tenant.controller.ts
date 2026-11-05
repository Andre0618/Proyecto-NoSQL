import { Request, Response } from "express"
import { prisma } from "../lib/prisma"
import { asyncHandler } from "../lib/asyncHandler"
import { BusinessError } from "../lib/errors"
import { audit } from "../lib/audit"
import { forgetTenant, getTenantConfig, tenantPayload } from "../lib/tenantConfig"
import { SettingsPatchSchema, mergeSettings } from "../lib/tenantSettings"

const restaurantOf = (req: Request) => {
  const restaurantId = req.user?.restaurantId
  if (!restaurantId) throw new BusinessError("UNAUTHENTICATED")
  return restaurantId
}

// Plan, funcionalidades y configuración del restaurante de quien pregunta
export const getTenant = asyncHandler(async (req: Request, res: Response) => {
  return res.json(tenantPayload(await getTenantConfig(restaurantOf(req))))
})

// El administrador cambia su configuración. El plan y las excepciones no se tocan desde aquí: son del operador
// del servicio (npm run set-plan), no de cada restaurante.
export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const restaurantId = restaurantOf(req)
  const patch = SettingsPatchSchema.parse(req.body)

  const current = (await getTenantConfig(restaurantId)).settings
  const merged = mergeSettings(current, patch)
  if (!merged.success) throw merged.error

  await prisma.restaurant.update({ where: { id: restaurantId }, data: { settings: merged.data } })
  forgetTenant(restaurantId)
  audit(req, "tenant.settings", { patch })

  return res.json(tenantPayload(await getTenantConfig(restaurantId)))
})
