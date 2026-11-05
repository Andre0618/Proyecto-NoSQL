import { test } from "node:test"
import assert from "node:assert/strict"

process.env.JWT_SECRET ??= "una-clave-de-prueba-de-al-menos-32-caracteres"
process.env.DATABASE_URL ??= "postgresql://prueba:prueba@localhost:5432/prueba"

import { BusinessError, HTTP, errorCodes, errorMessage, errorStatus } from "./errors"
import { passwordStamp } from "./session"

test("todos los errores tienen un estado HTTP de error y un mensaje", () => {
  for (const code of errorCodes) {
    const status = errorStatus(code)
    assert.ok(status >= 400 && status <= 599, `${code} tiene el estado ${status}`)
    assert.ok(errorMessage(code).length > 0, `${code} no tiene mensaje`)
  }
})

test("los estados siguen la convención: 401 sin sesión, 403 sin permiso, 404 no existe, 409 choca con los datos", () => {
  const esperado: Record<string, number> = {
    UNAUTHENTICATED: HTTP.UNAUTHORIZED,
    SESSION_INVALID: HTTP.UNAUTHORIZED,
    INVALID_CREDENTIALS: HTTP.UNAUTHORIZED,
    FORBIDDEN: HTTP.FORBIDDEN,
    ADMIN_ONLY: HTTP.FORBIDDEN,
    RESOURCE_NOT_FOUND: HTTP.NOT_FOUND,
    ROUTE_NOT_FOUND: HTTP.NOT_FOUND,
    ORDER_NOT_OPEN: HTTP.CONFLICT,
    INSUFFICIENT_STOCK: HTTP.CONFLICT,
    EMAIL_TAKEN: HTTP.CONFLICT,
    DUPLICATE: HTTP.CONFLICT,
    EMPTY_DAY: HTTP.UNPROCESSABLE,
    VALIDATION_ERROR: HTTP.BAD_REQUEST,
    PAYLOAD_TOO_LARGE: HTTP.PAYLOAD_TOO_LARGE,
    INTERNAL: HTTP.SERVER_ERROR,
  }
  for (const [code, status] of Object.entries(esperado)) {
    assert.equal(errorStatus(code as never), status, code)
  }
})

test("una contraseña equivocada al cambiarla NO es 401, para que la app no cierre la sesión", () => {
  assert.equal(errorStatus("WRONG_PASSWORD"), HTTP.BAD_REQUEST)
})

test("BusinessError toma su estado del catálogo y lleva los detalles", () => {
  const err = new BusinessError("INSUFFICIENT_STOCK", { available: 3 })
  assert.equal(err.status, HTTP.CONFLICT)
  assert.deepEqual(err.details, { available: 3 })
  assert.equal(new BusinessError("ORDER_NOT_FOUND").status, HTTP.NOT_FOUND)
})

test("la huella de la contraseña cambia con la contraseña y no revela el hash", () => {
  const a = passwordStamp("$2a$12$hash-de-la-clave-vieja")
  const b = passwordStamp("$2a$12$hash-de-la-clave-nueva")
  assert.notEqual(a, b)
  assert.equal(a, passwordStamp("$2a$12$hash-de-la-clave-vieja"))
  assert.equal(a.length, 16)
  assert.ok(!"$2a$12$hash-de-la-clave-vieja".includes(a))
})
