import { createHash } from "crypto"
import jwt from "jsonwebtoken"
import { env } from "./env"

export const TOKEN_EXPIRES_IN = "12h"

// Huella corta de la contraseña actual. Va dentro del token: si la contraseña cambia, la huella cambia
// y todos los tokens anteriores dejan de servir, sin guardar nada más en la base.
export const passwordStamp = (passwordHash: string) =>
  createHash("sha256").update(passwordHash).digest("hex").slice(0, 16)

export const signToken = (
  user: { id: string; role: "ADMIN" | "EMPLOYEE"; restaurantId: string; password: string }
) =>
  jwt.sign(
    { userId: user.id, role: user.role, restaurantId: user.restaurantId, pv: passwordStamp(user.password) },
    env.jwtSecret,
    { expiresIn: TOKEN_EXPIRES_IN }
  )
