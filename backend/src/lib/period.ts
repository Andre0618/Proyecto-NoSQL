import { prisma, type Tx } from "./prisma"
import { getColombiaDayRange } from "./date"

type Db = Pick<Tx, "dailySummary">

// "El día" es todo lo que pasó desde el último cierre, no el día del calendario; si no, una venta de las
// 11:58 p. m. desaparece a medianoche. Si nunca se cerró, cuenta desde el inicio de ayer.
export const getOpenPeriod = async (
  restaurantId: string,
  db: Db = prisma
): Promise<{ from: Date; lastCloseAt: Date | null }> => {
  const last = await db.dailySummary.findFirst({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  })
  if (last) return { from: last.createdAt, lastCloseAt: last.createdAt }

  const { today } = getColombiaDayRange()
  return { from: new Date(today.getTime() - 24 * 60 * 60 * 1000), lastCloseAt: null }
}

export const closedSince = (from: Date) => ({
  status: "CERRADA" as const,
  OR: [
    { closedAt: { gt: from } },
    { closedAt: null, createdAt: { gt: from } },
  ],
})
