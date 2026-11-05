// Reglas que vuelven al restaurante una dimensión de TODA consulta y no un campo que cada controlador debe
// acordarse de filtrar. Aquí no hay base de datos: son funciones puras para poder probarlas una por una.

export class TenantScopeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TenantScopeError"
  }
}

// Modelos que llevan restaurantId directo
const OWN_COLUMN = new Set([
  "User", "Category", "Product", "Table", "Order", "DailySummary", "CashMovement", "EmployeePayment",
])
// El propio restaurante se identifica por su id
const SELF = "Restaurant"
// No tienen restaurantId: pertenecen a una orden y por ella al restaurante
const THROUGH_ORDER = "OrderItem"

export const isTenantModel = (model: string) =>
  OWN_COLUMN.has(model) || model === SELF || model === THROUGH_ORDER

const WITH_WHERE = new Set([
  "findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany",
  "count", "aggregate", "groupBy",
  "update", "updateMany", "delete", "deleteMany", "upsert",
])
const CREATE_MANY = new Set(["createMany", "createManyAndReturn"])

type Args = Record<string, unknown> | undefined

// Si el código ya filtra por restaurante, tiene que ser por el mismo de la petición y con igualdad simple.
// Cualquier otra cosa (otro restaurante, un { in: [...] }, un OR) se rechaza en vez de interpretarse.
const pinned = (where: Record<string, unknown>, column: string, tenantId: string) => {
  const given = where[column]
  if (given === undefined) return
  if (given !== tenantId) {
    throw new TenantScopeError(`La consulta filtra ${column} por un valor distinto al restaurante de la petición.`)
  }
}

const scopeWhere = (model: string, where: unknown, tenantId: string): Record<string, unknown> => {
  const base = (where ?? {}) as Record<string, unknown>
  if (model === THROUGH_ORDER) {
    const order = base.order as Record<string, unknown> | undefined
    if (order !== undefined) {
      if (typeof order !== "object" || order === null || "is" in order || "isNot" in order) {
        throw new TenantScopeError("Filtro por orden no soportado.")
      }
      pinned(order, "restaurantId", tenantId)
    }
    return { ...base, order: { ...(order ?? {}), restaurantId: tenantId } }
  }
  const column = model === SELF ? "id" : "restaurantId"
  pinned(base, column, tenantId)
  return { ...base, [column]: tenantId }
}

const scopeCreate = (model: string, data: unknown, tenantId: string): Record<string, unknown> => {
  if (model === THROUGH_ORDER) return data as Record<string, unknown>
  if (model === SELF) throw new TenantScopeError("Un restaurante no se crea dentro de la petición de otro.")
  const row = (data ?? {}) as Record<string, unknown>
  if ("restaurant" in row) throw new TenantScopeError("Indica restaurantId en lugar de la relación restaurant.")
  pinned(row, "restaurantId", tenantId)
  return { ...row, restaurantId: tenantId }
}

// Un update no puede sacar un registro de su restaurante cambiándole restaurantId (ni por la relación).
const guardUpdate = (model: string, data: unknown, tenantId: string) => {
  if (model === THROUGH_ORDER || model === SELF || data === undefined || data === null) return
  const row = data as Record<string, unknown>
  if ("restaurant" in row) throw new TenantScopeError("No se puede cambiar el restaurante de un registro.")
  pinned(row, "restaurantId", tenantId)
}

// Devuelve los argumentos de la consulta ya limitados al restaurante. Sin restaurante (tenantId indefinido) los
// modelos del tenant no se tocan: quien lo necesite (el login, por ejemplo) debe usar el cliente sin límite a propósito.
export const scopeArgs = (model: string, operation: string, args: Args, tenantId: string | undefined): Args => {
  if (!isTenantModel(model)) return args
  if (!tenantId) {
    throw new TenantScopeError(`Consulta a ${model}.${operation} sin restaurante en la petición.`)
  }

  const out: Record<string, unknown> = { ...(args ?? {}) }

  if (WITH_WHERE.has(operation)) {
    out.where = scopeWhere(model, out.where, tenantId)
  }

  // upsert trae su alta en el campo create; create y createMany la traen en data
  if (operation === "upsert") {
    out.create = scopeCreate(model, out.create, tenantId)
  }
  if (operation === "update" || operation === "updateMany" || operation === "upsert") {
    guardUpdate(model, operation === "upsert" ? out.update : out.data, tenantId)
  }
  if (operation === "create") {
    out.data = scopeCreate(model, out.data, tenantId)
  }
  if (CREATE_MANY.has(operation)) {
    const data = out.data
    out.data = Array.isArray(data)
      ? data.map(row => scopeCreate(model, row, tenantId))
      : scopeCreate(model, data, tenantId)
  }

  return out
}
