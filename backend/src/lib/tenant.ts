import { AsyncLocalStorage } from "node:async_hooks"

// El restaurante de la petición en curso. authMiddleware lo fija una vez y de ahí en adelante todo lo que se
// ejecute por esa petición (controladores, servicios, transacciones) lo ve sin recibirlo como parámetro.
const storage = new AsyncLocalStorage<{ restaurantId: string }>()

export const runWithTenant = <T>(restaurantId: string, fn: () => T): T =>
  storage.run({ restaurantId }, fn)

export const currentTenant = (): string | undefined => storage.getStore()?.restaurantId
