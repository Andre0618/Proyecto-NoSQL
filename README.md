<div align="center">

# RestaurantOS

**Sistema de gestión SaaS para restaurantes**

Plataforma multi-tenant que centraliza operaciones de mesa, inventario, caja, empleados y reportes en una sola aplicación.

![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)
![Express](https://img.shields.io/badge/Express-5-000000?style=flat-square&logo=express)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat-square&logo=prisma)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-4169E1?style=flat-square&logo=postgresql)

</div>

---

## Qué es RestaurantOS

RestaurantOS es una aplicación web de gestión completa para restaurantes. Un administrador registra su restaurante, crea empleados, y desde ese momento tiene control total sobre:

- El estado de sus mesas y órdenes en tiempo real
- El inventario de productos con alertas de stock mínimo
- El registro de compras, gastos y movimientos de caja
- El pago de nómina y propinas a empleados
- El cierre de caja diario con reporte descargable en PDF

Cada restaurante opera de forma completamente aislada (multi-tenant). Un empleado solo puede ver y gestionar mesas; el administrador tiene acceso completo.

---

## Stack

| Capa | Tecnología |
|---|---|
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript 5 |
| **Estilos** | Tailwind CSS 4, shadcn/ui, Lucide React |
| **Formularios** | React Hook Form, Zod |
| **Gráficas** | Barras en SVG propias (sin librería) |
| **Tipografía** | Bitter (títulos) y Source Sans 3 (texto) |
| **HTTP Client** | Axios |
| **Backend** | Node.js, Express 5, TypeScript 6 |
| **ORM** | Prisma 5 con PostgreSQL (Neon serverless) |
| **Auth** | JWT (12 h), bcryptjs (cost 12) |
| **Seguridad** | Helmet, CORS allowlist, Zod schema validation |
| **PDF** | pdfkit |

---

## Funcionalidades

### Para el administrador (ADMIN)

| Módulo | Qué permite |
|---|---|
| **Dashboard** | Resumen del día, gráfica de ventas, caja del día (neto) y propinas por entregar |
| **Mesas** | Crear y configurar mesas, ver estado (disponible / ocupada) |
| **Inventario** | Gestionar productos y categorías, ver alertas de stock bajo |
| **Compras y Gastos** | Registrar compras, gastos y base de caja; todo se descuenta de la caja del día |
| **Empleados** | Crear cuentas de empleados y registrar sueldos y propinas entregadas |
| **Resumen Diario** | Cierre de caja con totales consolidados |
| **PDF** | Descargar el reporte completo (todos los cierres y el detalle de compras, gastos y pagos). Después se ofrece reiniciar el historial; el PDF queda como único respaldo |

### Para el empleado (EMPLOYEE)

| Módulo | Qué permite |
|---|---|
| **Mesas** | Ver mesas disponibles y ocupadas |
| **Órdenes** | Tocar una mesa abre la comanda encima (con el fondo borroso): agregar productos, elegir método de pago y propina, cerrar o cancelar la orden |

### Cuentas del día

```
neto = ventas + base de caja − gastos − compras − sueldos
```

Las propinas son del personal y no cuentan como ingreso: se guardan aparte (cobradas y entregadas) y el dashboard muestra cuánto falta por entregar. **El "día" es todo lo ocurrido desde el último cierre**, no el día del calendario: una venta de las 11:58 p. m. sigue contando después de medianoche hasta que se cierre el día, y el cierre queda con la fecha del primer movimiento. Si nunca se ha cerrado, cuenta desde el inicio de ayer. Al cerrar el día se guarda el resumen y el dashboard vuelve a cero. Si hubo más ventas después, al cerrar de nuevo el resumen se recalcula con todas las órdenes de hoy.

**Reiniciar el historial:** "Descargar PDF" genera el reporte y luego pregunta si borrar lo que contiene (cierres, compras, gastos, pagos y órdenes archivadas). Solo se borra lo registrado hasta el último cierre; lo posterior no se toca.

---

## Arquitectura

Las pruebas de la lógica pura (fechas, impresión) corren con `npm test` dentro de `backend/` y `frontend/`.

```
restaurante-saas/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma           # 10 modelos, índices de rendimiento
│   │   └── migrations/
│   └── src/
│       ├── controllers/            # auth, products, categories, tables,
│       │                           # orders, cashMovements, employeePayments,
│       │                           # dailySummary, pdf
│       ├── routes/                 # REST endpoints por recurso
│       ├── middlewares/
│       │   ├── auth.middleware.ts  # JWT verify + adminOnly (DB fresh check)
│       │   ├── tenant.middleware.ts
│       │   └── error.middleware.ts # Error handler centralizado
│       ├── services/
│       │   └── dailyClose.service.ts
│       └── lib/
│           ├── prisma.ts           # Prisma client singleton
│           ├── env.ts              # Variables de entorno validadas
│           ├── errors.ts           # BusinessError tipado
│           ├── validators.ts       # Schemas Zod
│           ├── period.ts           # "El día": lo abierto desde el último cierre
│           ├── date.ts             # Día colombiano (UTC-5)
│           ├── audit.ts            # Registro de acciones sensibles
│           └── asyncHandler.ts     # Wrapper try/catch para controllers
└── frontend/
    └── src/
        ├── app/
        │   ├── (auth)/login/       # Página pública de login
        │   └── (dashboard)/        # Rutas protegidas
        │       ├── dashboard/
        │       ├── tables/
        │       ├── inventory/
        │       ├── purchases/
        │       ├── employees/
        │       └── layout.tsx      # Sidebar + auth guard
        ├── components/ui/
        │   └── layout/Sidebar.tsx  # Navegación principal responsiva
        ├── lib/
        │   ├── axios.ts            # Instancia con interceptor JWT
        │   ├── auth.ts             # Sesión (useCurrentUser, setSession, clearSession)
        │   ├── escpos.ts           # Comandos ESC/POS y tildes (PC850)
        │   ├── receipt.ts          # Cuenta / comprobante para la térmica
        │   └── printer.ts          # Conexión WebUSB con la impresora
        └── types/
```

### Modelo de datos

```
Restaurant
  ├── User (ADMIN | EMPLOYEE)
  ├── Category → Product
  ├── Table → Order → OrderItem → Product
  ├── CashMovement  (COMPRA | GASTO | BASE_CAJA)
  ├── EmployeePayment
  └── DailySummary
```

### Roles

| Acción | Administrador | Empleado |
|---|---|---|
| Ver mesas y productos, abrir órdenes, cobrar y cancelar | Sí | Sí |
| Crear o eliminar mesas, productos y categorías | Sí | No |
| Dashboard, estadísticas, caja, compras, gastos y pagos | Sí | No |
| Cerrar el día, descargar el reporte y reiniciar el historial | Sí | No |
| Crear empleados, cambiar sus contraseñas y desactivarlos | Sí | No |

Los permisos se validan en el backend en cada petición; la interfaz solo oculta lo que no corresponde.

### Multi-tenancy: contexto, planes y configuración

El restaurante (tenant) atraviesa todo el sistema y no es un campo que cada consulta deba recordar:

```
Usuario → Contexto del tenant → Roles + Funcionalidades del plan → Módulos de negocio → Datos del tenant
              ↑ Configuración        ↑ Feature flags
```

- **Contexto del tenant.** `authMiddleware` fija el restaurante de la petición (`backend/src/lib/tenant.ts`, `AsyncLocalStorage`). El cliente de base de datos que usa todo el backend (`backend/src/lib/prisma.ts`) limita cada consulta a ese restaurante por sí solo (`tenantScope.ts`): lecturas, actualizaciones, borrados y altas. Si una consulta pide otro restaurante, o se hace sin restaurante en la petición, falla en vez de devolver datos. Las únicas excepciones (el login, la verificación de la cuenta y que un correo no se repita) usan `unscopedPrisma`, y una prueba (`tenantIsolation.test.ts`) lista los únicos archivos que pueden importarlo.
- **Planes y funcionalidades.** Cada restaurante tiene un plan (`BASICO` o `PRO`) y, si hace falta, excepciones por funcionalidad (feature flags). Hoy hay dos: `cash_management` (compras, gastos, base de caja y pagos a empleados) y `pdf_reports` (reportes PDF). El backend lo exige con `requireFeature(...)` y el frontend oculta lo que el plan no trae. Los restaurantes que ya existían quedan en `PRO`, sin perder nada. Para cambiarlo: `npm run set-plan -- "Nombre o id" BASICO pdf_reports=on` (dentro de `backend/`).
- **Configuración por restaurante.** Propina sugerida (`tipPercent`, 10 por defecto) y medios de pago habilitados (`paymentMethods`). Se leen con `GET /api/tenant` y el administrador las cambia con `PATCH /api/tenant/settings`; el cobro rechaza un medio de pago deshabilitado.

### Seguridad

- Cada petición confirma en la base que la cuenta existe y sigue activa; el rol y el restaurante salen de la base, no del token. Un empleado eliminado o desactivado pierde el acceso al instante.
- La sesión dura 12 h. Si la pantalla se queda abierta, al vencer vuelve sola al login con un aviso. Cambiar o restablecer una contraseña cierra todas las sesiones abiertas de esa cuenta (el token lleva una huella de la contraseña).
- Los errores del API tienen siempre la forma `{ code, message }` y su código HTTP sale de un solo catálogo (`backend/src/lib/errors.ts`): 401 sin sesión, 403 sin permiso, 404 no existe, 409 choca con el estado de los datos, 422 nada que hacer.
- Todos los recursos se filtran por restaurante; ningún restaurante puede ver ni tocar datos de otro (probado con dos restaurantes).
- Las acciones de administrador confirman el rol directamente en la base, sin caché.
- Contraseñas con bcrypt (costo 12), mínimo 8 caracteres. El login tarda lo mismo exista o no el correo y solo cuentan los intentos fallidos (20 cada 15 minutos por IP). Hay además un tope general de 600 peticiones por minuto por IP.
- Un empleado con órdenes o pagos no se borra: se desactiva (deja de poder entrar y su historial se conserva).
- Helmet en la API; en el frontend, cabeceras de seguridad y una política CSP en producción que solo deja hablar con la propia app y con la API.
- CORS con lista de orígenes explícita (`localhost:3000`, el dominio de producción y lo que se defina en `FRONTEND_URL` / `CORS_ORIGINS`).
- Registro en los logs (líneas JSON con `"type":"audit"`) de quién cierra el día, reinicia el historial o elimina datos.
- No existe un endpoint público para registrarse.
- En producción define `NODE_ENV=production`: sin eso los errores internos muestran más detalle del debido.

---

### 2. Instalación

Crea `backend/.env` (hay un ejemplo en `backend/.env.example`):

```
DATABASE_URL=postgresql://usuario:clave@host/db?sslmode=require
JWT_SECRET=una-cadena-aleatoria-de-32-o-mas-caracteres
PORT=3001
# Opcionales
# CORS_ORIGINS=http://192.168.1.50:3000      # para probar desde el celular en la misma red
# ARCHIVE_RETENTION_DAYS=60                  # borra órdenes archivadas viejas (los cierres se conservan)
```

Y `frontend/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:3001/api/
```

```bash
# Backend
cd backend
npm install
npx prisma migrate deploy   # aplica las migraciones (base nueva o existente)
npm run dev                 # http://localhost:3001

# Frontend, en otra terminal
cd frontend
npm install
npm run dev                 # http://localhost:3000
```

### 3. Primer uso

El primer restaurante y su administrador se crean desde la terminal, sin ningún endpoint público:

```bash
cd backend
npm run create-admin -- "Nombre del restaurante" correo@ejemplo.com "una-clave-de-8-o-mas"
```

Muestra a qué base se conecta y pide confirmar antes de escribir. Después:

1. Iniciar sesión en `http://localhost:3000/login`
2. El admin crea empleados desde el módulo de Empleados (contraseña de mínimo 8 caracteres)

### Impresora térmica (tiquetes de 80 mm)

La app imprime directo a una impresora ESC/POS por USB, sin instalar nada más (WebUSB). Probada con la Digital POS DIG-C80250II, que solo trae USB, serial y Ethernet: no tiene Bluetooth ni wifi.

- **Quién imprime:** solo la caja (rol Administrador). Los meseros toman el pedido desde el celular, que no se conecta por USB, así que no ven el botón «Impresora» ni «Imprimir cuenta».
- **Qué imprime:** la cuenta (con propina voluntaria sugerida cercana al 10%, ajustada para que el total quede en billetes) desde el botón «Imprimir cuenta» de la comanda, y el comprobante de pago al cobrar si «Imprimir al cobrar» está activo.
- **Conexión en la tablet Android:** cable USB-B de la impresora + adaptador OTG (USB-C o micro USB a USB-A hembra). En **Chrome**, menú «Impresora» → «Conectar impresora» → elegir la impresora y aceptar el permiso. Se recuerda y se reconecta sola.
- **Requisito:** la página debe abrirse por **https** (Vercel lo cumple) o por `localhost`. Desde `http://IP-local:3000` Chrome bloquea USB; para probar así, activa `chrome://flags/#unsafely-treat-insecure-origin-as-secure` y agrega esa dirección.
- **Ajustes** (se guardan en cada dispositivo): ancho del texto (42 o 48 caracteres), «Sin tildes ni ñ» si en el papel salen símbolos raros, y el mensaje del final.
- **Si el navegador no soporta USB** (Safari, Firefox), «Imprimir cuenta» usa el diálogo de impresión del navegador con formato de 80 mm.
- **Plan B en Android:** la app RawBT acepta comandos ESC/POS por USB o red.

---
## Despliegue en producción

| Servicio | Plataforma recomendada |
|---|---|
| **Frontend** | [Vercel](https://vercel.com) — deploy automático desde Git |
| **Backend** | [Railway](https://railway.app) o [Render](https://render.com) |
| **Base de datos** | [Neon](https://neon.tech) — PostgreSQL serverless, free tier disponible |

El build del backend ejecuta `prisma migrate deploy` automáticamente antes de iniciar (`npm start`).

---
## Autor

Desarrollado por [@JuanCVO](https://github.com/JuanCVO).



