import { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"
import { env } from "../lib/env"
import { prisma } from "../lib/prisma"
import { getActiveUser } from "../lib/userCache"
import { sendError } from "../lib/errors"
import { runWithTenant } from "../lib/tenant"

interface JwtPayload {
  userId: string
  role: "ADMIN" | "EMPLOYEE"
  restaurantId?: string
  pv?: string
}

// Valida el token y que la cuenta siga activa. El rol y el restaurante salen de la base y no del token,
// así quien se elimina o desactiva pierde el acceso enseguida.
export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined

  if (!token) return sendError(res, "UNAUTHENTICATED")

  let decoded: JwtPayload
  try {
    decoded = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] }) as JwtPayload
  } catch {
    return sendError(res, "SESSION_INVALID")
  }

  try {
    const user = await getActiveUser(decoded.userId)
    if (!user) return sendError(res, "ACCOUNT_INACTIVE")
    // si la contraseña cambió después de emitir este token, la sesión ya no vale
    if (decoded.pv !== user.stamp) return sendError(res, "SESSION_INVALID")

    req.user = { userId: user.id, role: user.role, restaurantId: user.restaurantId }
    // desde aquí, todo lo que consulte la base en esta petición queda limitado a este restaurante
    runWithTenant(user.restaurantId, () => next())
  } catch (error) {
    next(error)
  }
}

// el rol se confirma en la base, sin caché
export const adminOnly = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tokenUser = req.user
    if (!tokenUser) return sendError(res, "UNAUTHENTICATED")

    const fresh = await prisma.user.findUnique({
      where: { id: tokenUser.userId },
      select: { role: true, restaurantId: true, active: true },
    })

    if (!fresh || !fresh.active || fresh.role !== "ADMIN") return sendError(res, "ADMIN_ONLY")

    req.user = { userId: tokenUser.userId, role: fresh.role, restaurantId: fresh.restaurantId }
    next()
  } catch (error) {
    next(error)
  }
}
