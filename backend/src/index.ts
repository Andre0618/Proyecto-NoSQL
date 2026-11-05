import "./lib/env"
import { sendError } from "./lib/errors"
import express from "express"
import cors from "cors"
import helmet from "helmet"
import rateLimit from "express-rate-limit"
import { env } from "./lib/env"
import { errorHandler } from "./middlewares/error.middleware"
import authRoutes from "./routes/auth.routes"
import productRoutes from "./routes/product.routes"
import categoryRoutes from "./routes/category.routes"
import tableRoutes from "./routes/table.routes"
import orderRoutes from "./routes/order.routes"
import dailySummaryRoutes from "./routes/dailySummary.routes"
import cashMovementRoutes from "./routes/cashMovement.routes"
import employeePaymentRoutes from "./routes/employeePayment.routes"
import tenantRoutes from "./routes/tenant.routes"

const app = express()

app.set("trust proxy", 1)

app.use(helmet())

const allowedOrigins = [
  "http://localhost:3000",
  "https://restaurante-saas-ashen.vercel.app",
  ...(env.frontendUrl ? [env.frontendUrl] : []),
  ...env.corsOrigins,
]

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) return callback(null, true)
    return callback(null, false)
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["X-Report-Until", "Content-Disposition"],
  preflightContinue: false,
  optionsSuccessStatus: 204,
}))

app.use(express.json({ limit: "100kb" }))

// tope general por IP; alto para que un local con varios dispositivos no lo note
app.use("/api", rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Demasiadas solicitudes. Espera un momento e intenta de nuevo." },
}))

if (!env.isProd) {
  app.use((req, _res, next) => {
    console.log(`[${req.method}] ${req.path}`)
    next()
  })
}

app.get("/", (_req, res) => res.json({ status: "ok", message: "API funcionando" }))
app.get("/health", (_req, res) => res.json({ status: "ok" }))

app.use("/api/auth", authRoutes)
app.use("/api/products", productRoutes)
app.use("/api/categories", categoryRoutes)
app.use("/api/tables", tableRoutes)
app.use("/api/orders", orderRoutes)
app.use("/api/daily-summary", dailySummaryRoutes)
app.use("/api/cash-movements", cashMovementRoutes)
app.use("/api/employee-payments", employeePaymentRoutes)
app.use("/api/tenant", tenantRoutes)

// cualquier ruta que no exista responde en JSON, igual que el resto de errores
app.use((_req, res) => sendError(res, "ROUTE_NOT_FOUND"))

app.use(errorHandler)

app.listen(env.port, () => {
  console.log(`Servidor corriendo en puerto ${env.port}`)
})
