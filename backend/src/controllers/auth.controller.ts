import { Request, Response } from "express"
import bcrypt from "bcryptjs"
import { prisma, unscopedPrisma } from "../lib/prisma"
import { LoginSchema, CreateEmployeeSchema, ChangePasswordSchema, ResetPasswordSchema } from "../lib/validators"
import { asyncHandler } from "../lib/asyncHandler"
import { BusinessError, HTTP } from "../lib/errors"
import { audit } from "../lib/audit"
import { forgetUser } from "../lib/userCache"
import { getTenantConfig, tenantPayload } from "../lib/tenantConfig"
import { signToken } from "../lib/session"

const BCRYPT_ROUNDS = 12

// Se compara igual aunque el correo no exista, para no delatar cuáles están registrados
const DUMMY_HASH = bcrypt.hashSync("contraseña-de-relleno", BCRYPT_ROUNDS)

// el correo es único en todo el sistema, no por restaurante: por eso esta búsqueda no lleva el límite
const findUserByEmailInsensitive = (email: string) =>
  unscopedPrisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } })

export const createEmployee = asyncHandler(async (req: Request, res: Response) => {
  const data = CreateEmployeeSchema.parse(req.body)
  const adminUser = req.user
  if (!adminUser?.restaurantId) throw new BusinessError("UNAUTHENTICATED")

  const existing = await findUserByEmailInsensitive(data.email)
  if (existing) throw new BusinessError("EMAIL_TAKEN")

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      password: await bcrypt.hash(data.password, BCRYPT_ROUNDS),
      restaurantId: adminUser.restaurantId,
      role: "EMPLOYEE",
    },
  })

  audit(req, "employee.create", { employeeId: user.id })

  return res.status(HTTP.CREATED).json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  })
})

export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const restaurantId = req.params.restaurantId as string
  const users = await prisma.user.findMany({
    where: { restaurantId, active: true },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  })
  return res.json(users)
})

// Con órdenes o pagos no se puede borrar sin perder el historial: se desactiva
export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.userId as string
  const adminUser = req.user
  if (!adminUser) throw new BusinessError("UNAUTHENTICATED")

  if (userId === adminUser.userId) throw new BusinessError("SELF_DELETE")

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      restaurantId: true, role: true, email: true,
      _count: { select: { orders: true, employeePayments: true } },
    },
  })
  if (!target) throw new BusinessError("RESOURCE_NOT_FOUND")
  if (target.restaurantId !== adminUser.restaurantId) {
    throw new BusinessError("FORBIDDEN")
  }
  if (target.role === "ADMIN") throw new BusinessError("ADMIN_PROTECTED")

  if (target._count.orders > 0 || target._count.employeePayments > 0) {
    await prisma.user.update({
      where: { id: userId },
      data: { active: false, email: `${target.email}#inactivo-${Date.now()}` },
    })
    forgetUser(userId)
    audit(req, "employee.deactivate", { employeeId: userId })
    return res.json({ message: "Empleado desactivado. Ya no puede entrar y su historial se conserva.", deactivated: true })
  }

  await prisma.user.delete({ where: { id: userId } })
  forgetUser(userId)
  audit(req, "employee.delete", { employeeId: userId })
  return res.json({ message: "Usuario eliminado" })
})

export const changeOwnPassword = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = ChangePasswordSchema.parse(req.body)
  const userId = req.user?.userId
  if (!userId) throw new BusinessError("UNAUTHENTICATED")

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { password: true, role: true, restaurantId: true } })
  const ok = await bcrypt.compare(currentPassword, me?.password ?? DUMMY_HASH)
  if (!me || !ok) throw new BusinessError("WRONG_PASSWORD")

  const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
  await prisma.user.update({ where: { id: userId }, data: { password: newHash } })
  forgetUser(userId)
  audit(req, "password.change")
  // las sesiones abiertas en otros equipos quedan cerradas; esta recibe un token nuevo para seguir
  const token = signToken({ id: userId, role: me.role, restaurantId: me.restaurantId, password: newHash })
  return res.json({ message: "Contraseña actualizada.", token })
})

export const resetEmployeePassword = asyncHandler(async (req: Request, res: Response) => {
  const { password } = ResetPasswordSchema.parse(req.body)
  const userId = req.params.userId as string
  const adminUser = req.user
  if (!adminUser) throw new BusinessError("UNAUTHENTICATED")

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { restaurantId: true, role: true } })
  if (!target) throw new BusinessError("RESOURCE_NOT_FOUND")
  if (target.restaurantId !== adminUser.restaurantId) throw new BusinessError("FORBIDDEN")
  if (target.role === "ADMIN") throw new BusinessError("ADMIN_PASSWORD")

  await prisma.user.update({ where: { id: userId }, data: { password: await bcrypt.hash(password, BCRYPT_ROUNDS) } })
  // el empleado queda sin sesión en todos sus equipos hasta que entre con la clave nueva
  forgetUser(userId)
  audit(req, "password.reset", { employeeId: userId })
  return res.json({ message: "Contraseña actualizada." })
})

export const login = asyncHandler(async (req: Request, res: Response) => {
  const data = LoginSchema.parse(req.body)

  // todavía no hay restaurante en la petición: el login es lo que lo descubre
  const user = await unscopedPrisma.user.findFirst({
    where: { email: { equals: data.email, mode: "insensitive" } },
    include: { restaurant: { select: { name: true } } },
  })

  const isValidPassword = await bcrypt.compare(data.password, user?.password ?? DUMMY_HASH)
  if (!user || !user.active || !isValidPassword) throw new BusinessError("INVALID_CREDENTIALS")

  const token = signToken(user)

  return res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      restaurantId: user.restaurantId,
      restaurantName: user.restaurant?.name,
    },
    // plan, funcionalidades y configuración: el frontend los usa para mostrar solo lo que el restaurante tiene
    tenant: tenantPayload(await getTenantConfig(user.restaurantId)),
  })
})
