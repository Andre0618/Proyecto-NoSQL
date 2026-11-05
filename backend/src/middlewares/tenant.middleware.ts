import { Request, Response, NextFunction } from "express"
import { sendError } from "../lib/errors"

// authMiddleware ya trajo el restaurante real del usuario desde la base
export const sameRestaurant = (req: Request, res: Response, next: NextFunction) => {
  const tokenUser = req.user
  if (!tokenUser?.restaurantId) return sendError(res, "UNAUTHENTICATED")

  const claimed = req.params.restaurantId ?? req.body?.restaurantId
  if (!claimed) return sendError(res, "BAD_REQUEST", { message: "restaurantId requerido." })

  if (tokenUser.restaurantId !== claimed) {
    return sendError(res, "FORBIDDEN", { message: "No tienes acceso a este restaurante." })
  }

  next()
}

export const ownsResource = (
  fetchOwner: (id: string) => Promise<{ restaurantId: string } | null>
) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tokenUser = req.user
    if (!tokenUser?.restaurantId) return sendError(res, "UNAUTHENTICATED")

    const id = req.params.id as string
    if (!id) return sendError(res, "BAD_REQUEST", { message: "id requerido." })

    const resource = await fetchOwner(id)
    if (!resource) return sendError(res, "RESOURCE_NOT_FOUND")

    if (resource.restaurantId !== tokenUser.restaurantId) {
      return sendError(res, "FORBIDDEN", { message: "No tienes acceso a este recurso." })
    }

    next()
  } catch (error) {
    next(error)
  }
}
