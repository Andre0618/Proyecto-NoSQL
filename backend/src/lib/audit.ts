import { Request } from "express"

// Deja en los logs quién hizo una acción delicada (cierres, borrados, reinicios)
export const audit = (req: Request, action: string, details: Record<string, unknown> = {}) => {
  console.log(JSON.stringify({
    type: "audit",
    at: new Date().toISOString(),
    action,
    userId: req.user?.userId,
    restaurantId: req.user?.restaurantId,
    ip: req.ip,
    ...details,
  }))
}
