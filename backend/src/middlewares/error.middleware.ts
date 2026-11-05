import { Request, Response, NextFunction } from "express"
import { ZodError } from "zod"
import { env } from "../lib/env"
import { BusinessError, HTTP, errorMessage, sendError } from "../lib/errors"

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (err instanceof BusinessError) {
    return sendError(res, err.code, err.details)
  }

  if (err instanceof ZodError) {
    return sendError(res, "VALIDATION_ERROR", {
      message: "Datos inválidos",
      issues: err.issues.map(i => ({ path: i.path.join("."), message: i.message })),
    })
  }

  // errores de la base con un mensaje entendible
  const dbCode = (err as { code?: string }).code
  if (dbCode === "P2003") return sendError(res, "IN_USE")
  if (dbCode === "P2002") return sendError(res, "DUPLICATE")
  if (dbCode === "P2025") return sendError(res, "RESOURCE_NOT_FOUND")

  // errores del propio Express (JSON mal formado, cuerpo demasiado grande): son del cliente, no un fallo del servidor
  const status = (err as { status?: number }).status
  if (typeof status === "number" && status >= HTTP.BAD_REQUEST && status < HTTP.SERVER_ERROR) {
    if (status === HTTP.PAYLOAD_TOO_LARGE) return sendError(res, "PAYLOAD_TOO_LARGE")
    return sendError(res, "BAD_REQUEST", { message: "El cuerpo de la solicitud no es válido." })
  }

  if (env.isProd) {
    console.error(err.message)
    return sendError(res, "INTERNAL")
  }

  console.error(err.stack)
  return sendError(res, "INTERNAL", { message: err.message || errorMessage("INTERNAL") })
}
