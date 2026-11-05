// Qué puede usar cada restaurante. El plan da un conjunto de funcionalidades y cada restaurante puede tener
// excepciones (feature flags): prender una que su plan no trae, o apagar una que sí. Todo aquí es puro, sin base.

export const FEATURES = ["cash_management", "pdf_reports"] as const
export type Feature = (typeof FEATURES)[number]

export const FEATURE_LABELS: Record<Feature, string> = {
  cash_management: "Compras, gastos, base de caja y pagos a empleados",
  pdf_reports: "Reportes en PDF del cierre y del historial",
}

export type PlanName = "BASICO" | "PRO"

// Lo básico (mesas, órdenes, inventario, empleados y cierre del día) lo tienen todos los planes y no es una funcionalidad aparte.
export const PLAN_FEATURES: Record<PlanName, readonly Feature[]> = {
  BASICO: [],
  PRO: ["cash_management", "pdf_reports"],
}

const isFeature = (value: string): value is Feature => (FEATURES as readonly string[]).includes(value)

// Solo cuentan las excepciones conocidas y de verdad booleanas; lo demás se ignora para que un dato mal
// guardado no active por accidente una funcionalidad.
export const parseFlags = (raw: unknown): Partial<Record<Feature, boolean>> => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {}
  const out: Partial<Record<Feature, boolean>> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (isFeature(key) && typeof value === "boolean") out[key] = value
  }
  return out
}

export const resolveFeatures = (plan: PlanName, rawFlags: unknown): Feature[] => {
  const enabled = new Set<Feature>(PLAN_FEATURES[plan] ?? [])
  for (const [feature, on] of Object.entries(parseFlags(rawFlags)) as Array<[Feature, boolean]>) {
    if (on) enabled.add(feature)
    else enabled.delete(feature)
  }
  return FEATURES.filter(f => enabled.has(f))
}
