import { PrismaClient } from '@prisma/client'
import { currentTenant } from './tenant'
import { scopeArgs } from './tenantScope'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Cliente sin límite de restaurante. Solo para lo que ocurre ANTES de saber de qué restaurante es la petición
// (el login, la verificación de la cuenta) o que por naturaleza cruza restaurantes (que un correo no se repita).
// Cada uso es una excepción a propósito: tenantIsolation.test.ts lista los únicos archivos que pueden importarlo.
export const unscopedPrisma =
  globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = unscopedPrisma
}

// MongoDB no espera a que otra transacción suelte un documento: la que llega después falla con P2034 (conflicto de
// escritura). Es el equivalente a esperar un candado, así que se repite unas veces con una pausa corta.
const TX_RETRIES = 15
export const runTx = async <T>(
  fn: (tx: Tx) => Promise<T>,
  options?: { timeout?: number; maxWait?: number }
): Promise<T> => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn, options)
    } catch (err) {
      const code = (err as { code?: string })?.code
      if (code !== "P2034" || attempt >= TX_RETRIES) throw err
      await new Promise(r => setTimeout(r, Math.min(40 * attempt, 400) + Math.random() * 150))
    }
  }
}

// Lo que recibe una transacción interactiva (prisma.$transaction(async (tx) => ...)) del cliente de abajo
export type Tx = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

// Cliente que usa todo el backend. Cada consulta a un modelo del restaurante queda limitada al restaurante de la
// petición en curso, sin que el controlador lo pida; si no hay restaurante en la petición, falla en vez de leer todo.
export const prisma = unscopedPrisma.$extends({
  name: 'tenant-scope',
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        const scoped = scopeArgs(model, operation, args as Record<string, unknown> | undefined, currentTenant())
        return query(scoped as typeof args)
      },
    },
  },
})
