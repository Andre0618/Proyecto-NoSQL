import { test } from "node:test"
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"

const SRC = join(__dirname, "..")

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap(name => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return files(full)
    return full.endsWith(".ts") && !full.endsWith(".test.ts") ? [full] : []
  })

const rel = (file: string) => relative(SRC, file).split(sep).join("/")

// El cliente sin límite de restaurante solo lo pueden usar quienes de verdad lo necesitan. Agregar un archivo
// aquí es una decisión de seguridad: hay que justificarla en la revisión.
const MAY_USE_UNSCOPED = new Set([
  "lib/prisma.ts",                   // lo define
  "lib/userCache.ts",                // descubre de qué restaurante es la petición
  "controllers/auth.controller.ts",  // login y unicidad del correo, que cruzan restaurantes
])

test("solo los archivos permitidos usan el cliente sin límite de restaurante", () => {
  const offenders = files(SRC)
    .filter(f => /\bunscopedPrisma\b/.test(readFileSync(f, "utf8")))
    .map(rel)
    .filter(f => !MAY_USE_UNSCOPED.has(f))
  assert.deepEqual(offenders, [], `Usan unscopedPrisma sin estar permitidos: ${offenders.join(", ")}`)
})

test("nadie más crea su propio PrismaClient dentro del servidor", () => {
  const offenders = files(SRC)
    .filter(f => /new\s+PrismaClient\s*\(/.test(readFileSync(f, "utf8")))
    .map(rel)
    .filter(f => f !== "lib/prisma.ts")
  assert.deepEqual(offenders, [], `Crean un PrismaClient propio: ${offenders.join(", ")}`)
})
