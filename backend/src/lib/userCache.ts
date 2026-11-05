import { unscopedPrisma } from "./prisma"
import { passwordStamp } from "./session"

export type ActiveUser = {
  id: string
  role: "ADMIN" | "EMPLOYEE"
  restaurantId: string
  // huella de la contraseña vigente; sirve para saber si un token es de antes de un cambio de clave
  stamp: string
}

// caché corto para no ir a la base en cada petición; forgetUser lo vacía al instante
const TTL_MS = 30_000
const MAX_ENTRIES = 5_000
const cache = new Map<string, { user: ActiveUser | null; at: number }>()

export const getActiveUser = async (id: string): Promise<ActiveUser | null> => {
  const hit = cache.get(id)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.user

  // sin límite de restaurante: esta consulta es la que descubre de cuál es la petición
  const row = await unscopedPrisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, restaurantId: true, active: true, password: true },
  })
  const user = row && row.active
    ? { id: row.id, role: row.role, restaurantId: row.restaurantId, stamp: passwordStamp(row.password) }
    : null

  if (cache.size >= MAX_ENTRIES) cache.clear()
  cache.set(id, { user, at: Date.now() })
  return user
}

export const forgetUser = (id: string) => {
  cache.delete(id)
}
