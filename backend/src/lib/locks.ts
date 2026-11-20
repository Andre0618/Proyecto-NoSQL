import type { Tx } from "./prisma"

// Candado por restaurante que dura lo que dura la transacción. El cierre del día y el cobro de una orden escriben
// el mismo contador del restaurante: MongoDB no deja que dos transacciones modifiquen un documento a la vez, así
// que un cobro no puede quedar a medias justo cuando se cierra el día (y perderse), ni dos cierres correr a la vez.
// Quien pierde la carrera recibe un conflicto de escritura (P2034) y prisma.ts → runTx repite la transacción.
// Mongo no distingue candado compartido de exclusivo; el parámetro se conserva para dejar clara la intención.
export const lockClose = async (
  tx: Pick<Tx, "restaurant">,
  restaurantId: string,
  _mode: "exclusive" | "shared"
) => {
  await tx.restaurant.update({
    where: { id: restaurantId },
    data: { lockVersion: { increment: 1 } },
    select: { id: true },
  })
}
