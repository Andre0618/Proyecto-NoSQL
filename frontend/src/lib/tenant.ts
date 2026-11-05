import type { CurrentUser, Feature, TenantSettings } from "@/types/api"

export const DEFAULT_SETTINGS: TenantSettings = {
  tipPercent: 10,
  paymentMethods: ["Efectivo", "Nequi", "Bancolombia", "Mixto"],
}

// Sin sesión no hay nada que mostrar. Una sesión iniciada antes de existir los planes no trae tenant: se asume que
// tiene todo, porque quien decide de verdad es el servidor (responde "no incluido en tu plan") y el layout la refresca.
export const hasFeature = (user: CurrentUser | null, feature: Feature): boolean => {
  if (!user) return false
  return user.tenant ? user.tenant.features.includes(feature) : true
}

export const tenantSettings = (user: CurrentUser | null): TenantSettings => ({
  ...DEFAULT_SETTINGS,
  ...user?.tenant?.settings,
})
