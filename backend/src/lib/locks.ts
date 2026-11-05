import type { Tx } from "./prisma"

// Candado por restaurante que dura lo que dura la transacción. El cierre del día lo toma exclusivo y el cobro
// de una orden compartido: así un cobro no puede quedar a medias justo cuando se cierra el día (y perderse),
// ni dos cierres correr a la vez.
export const lockClose = async (
  tx: Pick<Tx, "$executeRaw">,
  restaurantId: string,
  mode: "exclusive" | "shared"
) => {
  if (mode === "exclusive") {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${restaurantId}))`
  } else {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtext(${restaurantId}))`
  }
}
