import { prisma } from "./prisma"
import { runWithTenant } from "./tenant"
import { BusinessError } from "./errors"
import { resolveFeatures, type Feature, type PlanName } from "./entitlements"
import { parseSettings, type Settings } from "./tenantSettings"

// Todo lo que define cómo funciona un restaurante: su plan, las funcionalidades que de verdad tiene (plan más
// excepciones) y su configuración. Es lo que viaja al frontend al iniciar sesión.
export type TenantConfig = {
  plan: PlanName
  features: Feature[]
  settings: Settings
}

// caché corto para no ir a la base en cada petición; forgetTenant lo vacía al instante cuando algo cambia
const TTL_MS = 30_000
const MAX_ENTRIES = 5_000
const cache = new Map<string, { config: TenantConfig; at: number }>()

export const getTenantConfig = async (restaurantId: string): Promise<TenantConfig> => {
  const hit = cache.get(restaurantId)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.config

  // el login pide esto antes de que la petición tenga restaurante: se declara aquí, para ese restaurante y no otro
  const row = await runWithTenant(restaurantId, async () =>
    await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { plan: true, settings: true, featureFlags: true },
    })
  )
  if (!row) throw new BusinessError("RESOURCE_NOT_FOUND")

  const config: TenantConfig = {
    plan: row.plan,
    features: resolveFeatures(row.plan, row.featureFlags),
    settings: parseSettings(row.settings),
  }

  if (cache.size >= MAX_ENTRIES) cache.clear()
  cache.set(restaurantId, { config, at: Date.now() })
  return config
}

export const forgetTenant = (restaurantId: string) => {
  cache.delete(restaurantId)
}

export const tenantPayload = (config: TenantConfig) => ({
  plan: config.plan,
  features: config.features,
  settings: config.settings,
})
