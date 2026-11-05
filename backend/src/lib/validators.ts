import { z } from "zod"

export const LoginSchema = z.object({
  email: z.string().email().toLowerCase().max(120),
  password: z.string().min(1).max(120),
})

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(120),
  newPassword: z.string().min(8).max(72),
})

export const ResetPasswordSchema = z.object({
  password: z.string().min(8).max(72),
})

export const CreateEmployeeSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().toLowerCase().max(120),
  password: z.string().min(8).max(72),
})

export const CashMovementSchema = z.object({
  type: z.enum(["COMPRA", "GASTO", "BASE_CAJA"]),
  concept: z.string().min(1).max(160),
  amount: z.number().positive().max(1_000_000_000),
  paymentMethod: z.string().max(40).optional().nullable(),
  notes: z.string().max(400).optional().nullable(),
  restaurantId: z.string().uuid(),
})

export const EmployeePaymentSchema = z.object({
  userId: z.string().uuid(),
  restaurantId: z.string().uuid(),
  salary: z.number().min(0).max(1_000_000_000),
  tip: z.number().min(0).max(1_000_000_000).optional(),
  // con qué se le pagó: el efectivo sale de la caja y se descuenta en el cierre de caja
  paymentMethod: z.enum(["Efectivo", "Nequi", "Bancolombia"]).default("Efectivo"),
  notes: z.string().max(400).optional().nullable(),
})

export const ProductSchema = z.object({
  name: z.string().min(1).max(120),
  price: z.number().min(0).max(1_000_000_000),
  unit: z.string().max(40).optional(),
  stock: z.number().int().min(0).max(1_000_000).optional(),
  minStock: z.number().int().min(0).max(1_000_000).optional(),
  categoryId: z.string().uuid(),
  restaurantId: z.string().uuid(),
})

export const ProductUpdateSchema = ProductSchema.partial().omit({ restaurantId: true })

export const CategorySchema = z.object({
  name: z.string().min(1).max(80),
  restaurantId: z.string().uuid(),
})

export const TableSchema = z.object({
  number: z.number().int().min(1).max(10000),
  restaurantId: z.string().uuid(),
})

export const CreateOrderSchema = z.object({
  tableId: z.string().uuid().optional().nullable(),
  restaurantId: z.string().uuid(),
})

export const AddItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(1000),
})

export const CloseOrderSchema = z.object({
  paymentMethod: z.enum(["Efectivo", "Nequi", "Bancolombia", "Mixto"]),
  tip: z.number().min(0).max(1_000_000_000).optional(),
  // solo en pago mixto: lo que se pagó en efectivo y por dónde se pagó el resto
  cashAmount: z.number().min(0).max(1_000_000_000).optional(),
  transferMethod: z.enum(["Nequi", "Bancolombia"]).optional(),
})

export const CloseDaySchema = z.object({
  restaurantId: z.string().uuid(),
})
