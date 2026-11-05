export type Role = "ADMIN" | "EMPLOYEE"

// Funcionalidades que un plan puede incluir; las decide el servidor (backend/src/lib/entitlements.ts)
export type Feature = "cash_management" | "pdf_reports"

export type PaymentMethod = "Efectivo" | "Nequi" | "Bancolombia" | "Mixto"

export type TenantSettings = {
  tipPercent: number
  paymentMethods: PaymentMethod[]
}

// Plan, funcionalidades y configuración del restaurante, como los devuelve el servidor
export type TenantConfig = {
  plan: "BASICO" | "PRO"
  features: Feature[]
  settings: TenantSettings
}

export type CurrentUser = {
  id: string
  name: string
  email: string
  role: Role
  restaurantId: string
  restaurantName?: string
  // las sesiones iniciadas antes de existir los planes no lo traen
  tenant?: TenantConfig
}

export type Employee = {
  id: string
  name: string
  email: string
  role: Role
  createdAt: string
}

export type Category = {
  id: string
  name: string
  restaurantId: string
}

export type Product = {
  id: string
  name: string
  price: number
  unit: string
  stock: number
  minStock: number
  categoryId: string
  category?: Category
  restaurantId: string
  createdAt: string
}

export type TableStatus = "DISPONIBLE" | "OCUPADA"

export type Table = {
  id: string
  number: number
  status: TableStatus
  restaurantId: string
  orders?: Order[]
  createdAt: string
  updatedAt: string
}

export type OrderStatus = "ABIERTA" | "CERRADA" | "CANCELADA" | "ARCHIVADA"

export type OrderItem = {
  id: string
  quantity: number
  unitPrice: number
  productId: string
  product: Product
  orderId: string
}

export type Order = {
  id: string
  total: number
  tip: number | null
  status: OrderStatus
  paymentMethod: string | null
  cashAmount?: number | null
  transferMethod?: string | null
  restaurantId: string
  userId: string
  tableId: string | null
  table?: { number: number } | null
  items: OrderItem[]
  createdAt: string
}

export type MovementType = "COMPRA" | "GASTO" | "BASE_CAJA"

export type CashMovement = {
  id: string
  type: MovementType
  concept: string
  amount: number
  paymentMethod: string | null
  notes: string | null
  restaurantId: string
  createdAt: string
}

export type EmployeePayment = {
  id: string
  userId: string
  restaurantId: string
  salary: number
  tip: number
  /** "Efectivo" sale de la caja; "Nequi" o "Bancolombia" es transferencia */
  paymentMethod: string
  notes: string | null
  createdAt: string
  user: { name: string; role: Role }
}

export type DashboardStats = {
  totalIngresos: number
  totalPropinas: number
  totalRecibido: number
  totalPedidos: number
  totalPlatos: number
  mesasOcupadas: number
  totalMesas: number
  /** el último cierre (o el inicio de ayer si nunca se cerró) */
  periodStart: string
  lastCloseAt: string | null
}

export type DailySummary = {
  id: string
  date: string
  totalIngresos: number
  totalOrdenes: number
  totalPlatos: number
  totalPropinas: number
  totalGastos: number
  totalPagosEmpleados: number
  totalCompras?: number
  comprasEfectivo?: number
  gastosEfectivo?: number
  propinasEntregadas?: number
  sueldosEfectivo?: number
  propinasEntregadasEfectivo?: number
  baseCaja: number
  efectivo: number
  bancolombia: number
  nequi: number
  restaurantId: string
  createdAt: string
}

export type SummaryChart = {
  date: string
  day: string
  pedidos: number
  ingresos: number
  platos: number
  propinas: number
  baseCaja: number
  efectivo: number
  bancolombia: number
  nequi: number
}

export type ApiError = {
  code?: string
  message: string
  issues?: Array<{ path: string; message: string }>
}
