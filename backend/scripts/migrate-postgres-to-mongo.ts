// Copia los datos de la base PostgreSQL antigua (DATABASE_URL) a MongoDB Atlas (MONGODB_URL):
//   npm run migrate-data              # pide confirmar y copia
//   npm run migrate-data -- --dry-run # solo cuenta lo que hay en Postgres, no escribe
// Los UUID se reemplazan por ObjectId nuevos (el mismo UUID siempre da el mismo ObjectId dentro de una corrida).
// Pide que las colecciones de Mongo estén vacías, para no duplicar nada.
// Antes de la primera vez: npm run generate:legacy
import "dotenv/config"
import { randomBytes } from "node:crypto"
import readline from "node:readline/promises"
import { PrismaClient as MongoClient } from "@prisma/client"
// cliente generado desde prisma/legacy-postgres.prisma
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient: PgClient } = require("../node_modules/.prisma/client-pg") as { PrismaClient: new () => any }

const dryRun = process.argv.includes("--dry-run")

const fail = (message: string): never => {
  console.error(`\n${message}\n`)
  process.exit(1)
}

if (!process.env.DATABASE_URL) fail("Falta DATABASE_URL (la base PostgreSQL de origen) en backend/.env.")
if (!process.env.MONGODB_URL) fail("Falta MONGODB_URL (MongoDB Atlas, destino) en backend/.env.")

const hostOf = (url: string) => {
  try {
    return new URL(url).host
  } catch {
    return "(URL no válida)"
  }
}

// ObjectId: 4 bytes de tiempo + 5 aleatorios + 3 de contador, en hexadecimal
let counter = randomBytes(3).readUIntBE(0, 3)
const newObjectId = () => {
  const time = Buffer.alloc(4)
  time.writeUInt32BE(Math.floor(Date.now() / 1000))
  const count = Buffer.alloc(3)
  count.writeUIntBE(counter = (counter + 1) & 0xffffff, 0, 3)
  return Buffer.concat([time, randomBytes(5), count]).toString("hex")
}

const ids = new Map<string, string>()
const mapId = (uuid: string): string => {
  let id = ids.get(uuid)
  if (!id) ids.set(uuid, (id = newObjectId()))
  return id
}
const mapOpt = (uuid: string | null) => (uuid ? mapId(uuid) : null)

const chunks = <T>(rows: T[], size = 500): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

const pg = new PgClient()
const mongo = new MongoClient()

const main = async () => {
  const source = {
    restaurant: await pg.restaurant.findMany(),
    user: await pg.user.findMany(),
    category: await pg.category.findMany(),
    product: await pg.product.findMany(),
    table: await pg.table.findMany(),
    order: await pg.order.findMany(),
    orderItem: await pg.orderItem.findMany(),
    dailySummary: await pg.dailySummary.findMany(),
    cashMovement: await pg.cashMovement.findMany(),
    employeePayment: await pg.employeePayment.findMany(),
  }

  console.log(`\nOrigen  (PostgreSQL): ${hostOf(process.env.DATABASE_URL as string)}`)
  console.log(`Destino (MongoDB):    ${hostOf(process.env.MONGODB_URL as string)}\n`)
  for (const [name, rows] of Object.entries(source)) console.log(`  ${name.padEnd(16)} ${rows.length}`)

  const emails = source.user.map((u: { email: string }) => u.email.trim().toLowerCase())
  const repeated = emails.filter((e: string, i: number) => emails.indexOf(e) !== i)
  if (repeated.length) fail(`Hay correos que solo se diferencian por mayúsculas: ${[...new Set(repeated)].join(", ")}`)

  if (dryRun) return console.log("\n--dry-run: no se escribió nada.\n")

  const existing = await mongo.restaurant.count()
  if (existing > 0) {
    fail(`MongoDB ya tiene ${existing} restaurante(s). Vacía las colecciones antes de migrar para no duplicar datos.`)
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = (await rl.question("\n¿Copiar todo a MongoDB? (escribe si): ")).trim().toLowerCase()
  rl.close()
  if (answer !== "si" && answer !== "sí") fail("Cancelado. No se escribió nada.")

  const put = async (label: string, rows: any[], insert: (data: any[]) => Promise<unknown>) => {
    for (const part of chunks(rows)) await insert(part)
    console.log(`  ${label.padEnd(16)} ${rows.length} copiados`)
  }

  console.log("")
  await put("restaurant", source.restaurant.map((r: any) => ({ ...r, id: mapId(r.id) })), data => mongo.restaurant.createMany({ data }))
  await put("user", source.user.map((u: any) => ({
    ...u, id: mapId(u.id), email: u.email.trim().toLowerCase(), restaurantId: mapId(u.restaurantId),
  })), data => mongo.user.createMany({ data }))
  await put("category", source.category.map((c: any) => ({
    ...c, id: mapId(c.id), restaurantId: mapId(c.restaurantId),
  })), data => mongo.category.createMany({ data }))
  await put("product", source.product.map((p: any) => ({
    ...p, id: mapId(p.id), categoryId: mapId(p.categoryId), restaurantId: mapId(p.restaurantId),
  })), data => mongo.product.createMany({ data }))
  await put("table", source.table.map((t: any) => ({
    ...t, id: mapId(t.id), restaurantId: mapId(t.restaurantId),
  })), data => mongo.table.createMany({ data }))
  await put("order", source.order.map((o: any) => ({
    ...o, id: mapId(o.id), restaurantId: mapId(o.restaurantId), userId: mapId(o.userId), tableId: mapOpt(o.tableId),
  })), data => mongo.order.createMany({ data }))
  await put("orderItem", source.orderItem.map((i: any) => ({
    ...i, id: mapId(i.id), productId: mapId(i.productId), orderId: mapId(i.orderId),
  })), data => mongo.orderItem.createMany({ data }))
  await put("dailySummary", source.dailySummary.map((d: any) => ({
    ...d, id: mapId(d.id), restaurantId: mapId(d.restaurantId),
  })), data => mongo.dailySummary.createMany({ data }))
  await put("cashMovement", source.cashMovement.map((m: any) => ({
    ...m, id: mapId(m.id), restaurantId: mapId(m.restaurantId),
  })), data => mongo.cashMovement.createMany({ data }))
  await put("employeePayment", source.employeePayment.map((p: any) => ({
    ...p, id: mapId(p.id), userId: mapId(p.userId), restaurantId: mapId(p.restaurantId),
  })), data => mongo.employeePayment.createMany({ data }))

  // comprobación: lo que quedó en Mongo debe coincidir con lo que había en Postgres
  const after: Record<string, number> = {
    restaurant: await mongo.restaurant.count(),
    user: await mongo.user.count(),
    category: await mongo.category.count(),
    product: await mongo.product.count(),
    table: await mongo.table.count(),
    order: await mongo.order.count(),
    orderItem: await mongo.orderItem.count(),
    dailySummary: await mongo.dailySummary.count(),
    cashMovement: await mongo.cashMovement.count(),
    employeePayment: await mongo.employeePayment.count(),
  }
  const mismatch = Object.entries(source).filter(([name, rows]) => after[name] !== rows.length)
  if (mismatch.length) fail(`Los conteos no coinciden: ${mismatch.map(([n, r]) => `${n} (${r.length} → ${after[n]})`).join(", ")}`)
  console.log("\nListo: los conteos coinciden en las 10 colecciones.\n")
}

main()
  .catch(err => fail(`No se pudo migrar: ${err instanceof Error ? err.message : String(err)}`))
  .finally(async () => {
    await pg.$disconnect()
    await mongo.$disconnect()
  })
