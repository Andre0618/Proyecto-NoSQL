// Crea un restaurante con su administrador desde la terminal:
//   npx tsx scripts/create-restaurant.ts "Nombre" correo@ejemplo.com "clave-de-8-o-más"
// Muestra a qué base se conecta y pide confirmar antes de escribir.
import "dotenv/config"
import readline from "node:readline/promises"
import bcrypt from "bcryptjs"
import { PrismaClient } from "@prisma/client"

const [name, emailArg, password] = process.argv.slice(2)

const fail = (message: string): never => {
  console.error(`\n${message}\n`)
  process.exit(1)
}

if (!name || !emailArg || !password) {
  fail('Uso: npx tsx scripts/create-restaurant.ts "Nombre del restaurante" correo@ejemplo.com "clave-de-8-o-mas-caracteres"')
}

const email = emailArg.trim().toLowerCase()
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("El correo no es válido.")
if (password.length < 8 || password.length > 72) fail("La contraseña debe tener entre 8 y 72 caracteres.")
if (name.trim().length < 2) fail("El nombre del restaurante es muy corto.")

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").host
  } catch {
    return "(DATABASE_URL no válida)"
  }
})()

const prisma = new PrismaClient()

const main = async () => {
  console.log(`\nBase de datos: ${host}`)
  console.log(`Restaurante:   ${name.trim()}`)
  console.log(`Administrador: ${email}\n`)

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = (await rl.question("¿Crear en esa base? (escribe si): ")).trim().toLowerCase()
  rl.close()
  if (answer !== "si" && answer !== "sí") fail("Cancelado. No se creó nada.")

  const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } })
  if (existing) fail("Ya existe un usuario con ese correo.")

  const hash = await bcrypt.hash(password, 12)
  const restaurant = await prisma.restaurant.create({
    data: {
      name: name.trim(),
      users: { create: { name: "Administrador", email, password: hash, role: "ADMIN" } },
    },
    select: { id: true, name: true },
  })

  console.log(`\nListo. Restaurante "${restaurant.name}" creado (id ${restaurant.id}).`)
  console.log(`Ya puedes entrar con ${email} en la pantalla de login.\n`)
}

main()
  .catch(err => fail(`No se pudo crear: ${err instanceof Error ? err.message : String(err)}`))
  .finally(() => prisma.$disconnect())
