// Cambia el plan de un restaurante y sus excepciones (feature flags) desde la terminal:
//   npx tsx scripts/set-plan.ts "Nombre o id" PRO
//   npx tsx scripts/set-plan.ts "Nombre o id" BASICO pdf_reports=on
//   npx tsx scripts/set-plan.ts "Nombre o id" PRO pdf_reports=off cash_management=default
// on = prende, off = apaga, default = quita la excepción y vuelve a lo que diga el plan.
// Muestra a qué base se conecta, lo que va a cambiar y pide confirmar antes de escribir.
import "dotenv/config"
import readline from "node:readline/promises"
import { PrismaClient } from "@prisma/client"
import { FEATURES, parseFlags, resolveFeatures, type Feature, type PlanName } from "../src/lib/entitlements"

const [target, planArg, ...flagArgs] = process.argv.slice(2)

// el tipo va declarado a mano: así TypeScript sabe que después de fail() no se sigue
const fail: (message: string) => never = (message) => {
  console.error(`\n${message}\n`)
  process.exit(1)
}

const PLANS: PlanName[] = ["BASICO", "PRO"]
const usage = `Uso: npx tsx scripts/set-plan.ts "Nombre o id del restaurante" ${PLANS.join("|")} [funcionalidad=on|off|default ...]\nFuncionalidades: ${FEATURES.join(", ")}`

if (!target || !planArg) fail(usage)
const plan = planArg.toUpperCase() as PlanName
if (!PLANS.includes(plan)) fail(`Plan desconocido: ${planArg}\n${usage}`)

const changes = new Map<Feature, "on" | "off" | "default">()
for (const arg of flagArgs) {
  const [name, value] = arg.split("=")
  if (!(FEATURES as readonly string[]).includes(name)) fail(`Funcionalidad desconocida: ${name}\n${usage}`)
  if (value !== "on" && value !== "off" && value !== "default") fail(`Valor no válido en ${arg}: usa on, off o default.`)
  changes.set(name as Feature, value)
}

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").host
  } catch {
    return "(DATABASE_URL no válida)"
  }
})()

const prisma = new PrismaClient()

const main = async () => {
  const matches = await prisma.restaurant.findMany({
    where: { OR: [{ id: target }, { name: { equals: target, mode: "insensitive" } }] },
    select: { id: true, name: true, plan: true, featureFlags: true },
  })
  if (matches.length === 0) fail(`No hay ningún restaurante con id o nombre "${target}".`)
  if (matches.length > 1) {
    fail(`Hay ${matches.length} restaurantes con ese nombre; usa el id:\n` + matches.map(m => `  ${m.id}  ${m.name}`).join("\n"))
  }
  const restaurant = matches[0]

  const flags = parseFlags(restaurant.featureFlags)
  for (const [feature, value] of changes) {
    if (value === "default") delete flags[feature]
    else flags[feature] = value === "on"
  }

  console.log(`\nBase de datos: ${host}`)
  console.log(`Restaurante:   ${restaurant.name} (${restaurant.id})`)
  console.log(`Plan:          ${restaurant.plan} -> ${plan}`)
  console.log(`Excepciones:   ${JSON.stringify(flags)}`)
  console.log(`Quedará con:   ${resolveFeatures(plan, flags).join(", ") || "(solo lo básico)"}\n`)

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = (await rl.question("¿Aplicar en esa base? (escribe si): ")).trim().toLowerCase()
  rl.close()
  if (answer !== "si" && answer !== "sí") fail("Cancelado. No se cambió nada.")

  await prisma.restaurant.update({ where: { id: restaurant.id }, data: { plan, featureFlags: flags } })
  console.log("\nListo. El servidor lo toma en menos de 30 segundos; las sesiones abiertas lo ven al volver a iniciar sesión.\n")
}

main()
  .catch(err => fail(`No se pudo cambiar: ${err instanceof Error ? err.message : String(err)}`))
  .finally(() => prisma.$disconnect())
