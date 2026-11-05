import type { Response } from "express"

// Códigos de estado con nombre, para no repartir números sueltos por el código
export const HTTP = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNPROCESSABLE: 422,
  TOO_MANY_REQUESTS: 429,
  SERVER_ERROR: 500,
} as const

// Cada error tiene aquí su estado y su mensaje, y solo aquí. Un mismo error siempre responde igual.
const catalog = {
  // sesión y permisos
  UNAUTHENTICATED:     { status: HTTP.UNAUTHORIZED, message: "Inicia sesión para continuar." },
  SESSION_INVALID:     { status: HTTP.UNAUTHORIZED, message: "Tu sesión venció o ya no es válida. Inicia sesión de nuevo." },
  ACCOUNT_INACTIVE:    { status: HTTP.UNAUTHORIZED, message: "La cuenta ya no está activa." },
  INVALID_CREDENTIALS: { status: HTTP.UNAUTHORIZED, message: "Credenciales inválidas." },
  FORBIDDEN:           { status: HTTP.FORBIDDEN, message: "No tienes permiso para esta operación." },
  ADMIN_ONLY:          { status: HTTP.FORBIDDEN, message: "Acceso denegado." },
  PRODUCT_FOREIGN:     { status: HTTP.FORBIDDEN, message: "El producto no pertenece a este restaurante." },
  ADMIN_PROTECTED:     { status: HTTP.FORBIDDEN, message: "No se puede eliminar a un administrador." },
  ADMIN_PASSWORD:      { status: HTTP.FORBIDDEN, message: "Tu propia contraseña se cambia desde «Mi contraseña»." },
  FEATURE_DISABLED:    { status: HTTP.FORBIDDEN, message: "Esta función no está incluida en el plan de tu restaurante." },

  // la petición viene mal armada
  BAD_REQUEST:         { status: HTTP.BAD_REQUEST, message: "La solicitud no es válida." },
  VALIDATION_ERROR:    { status: HTTP.BAD_REQUEST, message: "Datos inválidos." },
  PAYLOAD_TOO_LARGE:   { status: HTTP.PAYLOAD_TOO_LARGE, message: "La solicitud es demasiado grande." },
  // no es 401: el servidor la rechaza a propósito para que la app no cierre la sesión al equivocarse de clave
  WRONG_PASSWORD:      { status: HTTP.BAD_REQUEST, message: "La contraseña actual no es correcta." },
  SELF_DELETE:         { status: HTTP.BAD_REQUEST, message: "No puedes eliminarte a ti mismo." },
  ORDER_EMPTY:         { status: HTTP.BAD_REQUEST, message: "La orden no tiene productos." },
  INVALID_SPLIT:       { status: HTTP.BAD_REQUEST, message: "En el pago mixto, el efectivo debe ser mayor a 0 y menor al total, y hay que elegir cómo se pagó el resto." },
  PAYMENT_METHOD_DISABLED: { status: HTTP.BAD_REQUEST, message: "Ese medio de pago no está habilitado en este restaurante." },
  NO_CLOSINGS:         { status: HTTP.BAD_REQUEST, message: "No hay cierres guardados para exportar. Cierra al menos un día." },

  // no existe
  ROUTE_NOT_FOUND:     { status: HTTP.NOT_FOUND, message: "Ruta no encontrada." },
  RESOURCE_NOT_FOUND:  { status: HTTP.NOT_FOUND, message: "Recurso no encontrado." },
  ORDER_NOT_FOUND:     { status: HTTP.NOT_FOUND, message: "Orden no encontrada." },
  PRODUCT_NOT_FOUND:   { status: HTTP.NOT_FOUND, message: "Producto no encontrado." },
  NO_SUMMARY:          { status: HTTP.NOT_FOUND, message: "No hay resumen del día para exportar." },

  // choca con el estado actual de los datos
  EMAIL_TAKEN:         { status: HTTP.CONFLICT, message: "El email ya está registrado." },
  DUPLICATE:           { status: HTTP.CONFLICT, message: "Ya existe un registro con esos datos." },
  DUPLICATE_BASE_CAJA: { status: HTTP.CONFLICT, message: "La base de caja ya está registrada para hoy." },
  IN_USE:              { status: HTTP.CONFLICT, message: "No se puede eliminar porque tiene registros asociados (por ejemplo, órdenes anteriores)." },
  ORDER_NOT_OPEN:      { status: HTTP.CONFLICT, message: "La orden ya está cerrada." },
  INSUFFICIENT_STOCK:  { status: HTTP.CONFLICT, message: "Stock insuficiente." },

  // la petición es correcta pero no hay nada que hacer
  EMPTY_DAY:           { status: HTTP.UNPROCESSABLE, message: "No hay datos del día para cerrar." },

  PDF_FAILED:          { status: HTTP.SERVER_ERROR, message: "No se pudo generar el PDF." },
  INTERNAL:            { status: HTTP.SERVER_ERROR, message: "Error interno del servidor." },
} as const satisfies Record<string, { status: number; message: string }>

export type ErrorCode = keyof typeof catalog

export const errorStatus = (code: ErrorCode): number => catalog[code].status
export const errorMessage = (code: ErrorCode): string => catalog[code].message
export const errorCodes = Object.keys(catalog) as ErrorCode[]

export class BusinessError extends Error {
  public status: number
  // details se mezcla en la respuesta (por ejemplo { available } o un message más específico)
  constructor(public code: ErrorCode, public details?: Record<string, unknown>) {
    super(code)
    this.name = "BusinessError"
    this.status = errorStatus(code)
  }
}

// Respuesta de error con la misma forma en todas partes: { code, message, ...details }
export const sendError = (res: Response, code: ErrorCode, details?: Record<string, unknown>) =>
  res.status(errorStatus(code)).json({ code, message: errorMessage(code), ...(details ?? {}) })
