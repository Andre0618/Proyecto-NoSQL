"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Eye, EyeOff } from "lucide-react"

import api from "@/lib/axios"
import { SESSION_NOTICE_KEY, setSession } from "@/lib/auth"
import { apiMessage } from "@/lib/errors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LoginIllustration } from "@/components/ui/login-illustration"

const loginSchema = z.object({
  email: z.string().email("Escribe un correo válido"),
  password: z.string().min(1, "Escribe tu contraseña"),
  remember: z.boolean(),
})

type LoginForm = z.infer<typeof loginSchema>

// Solo el correo, y solo si la persona lo pide: en la tablet de la caja entran varias personas
const REMEMBER_KEY = "login-email"

const readRemembered = () => {
  try { return localStorage.getItem(REMEMBER_KEY) ?? "" } catch { return "" }
}

const noSubscribe = () => () => {}
const readNotice = () => {
  try { return sessionStorage.getItem(SESSION_NOTICE_KEY) ?? "" } catch { return "" }
}

// pastilla como en el diseño; 48 px de alto para tocarla bien en el celular
const pill = "h-12 rounded-full px-5"

export default function LoginPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [serverError, setServerError] = useState("")
  // en el servidor y al hidratar no hay aviso; en el navegador, el que dejó el cierre de sesión
  const notice = useSyncExternalStore(noSubscribe, readNotice, () => "")

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", remember: false },
  })

  // el correo guardado se pone después de hidratar: en el servidor no hay localStorage
  useEffect(() => {
    const saved = readRemembered()
    if (!saved) return
    setValue("email", saved)
    setValue("remember", true)
  }, [setValue])

  const onSubmit = async ({ email, password, remember }: LoginForm) => {
    setIsLoading(true)
    setServerError("")
    try { sessionStorage.removeItem(SESSION_NOTICE_KEY) } catch { /* nada que borrar */ }
    try {
      const response = await api.post("/auth/login", { email, password })
      const { token, user, tenant } = response.data

      setSession(token, {
        id:             user.id,
        name:           user.name,
        email:          user.email,
        role:           user.role,
        restaurantId:   user.restaurantId,
        restaurantName: user.restaurantName,
        tenant,
      })

      // se guarda solo cuando el ingreso funcionó, así no queda recordado un correo mal escrito
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, email)
        else localStorage.removeItem(REMEMBER_KEY)
      } catch { /* sin almacenamiento: igual se entra */ }

      router.push(user.role === "EMPLOYEE" ? "/tables" : "/dashboard")
    } catch (error) {
      setServerError(apiMessage(error, "No se pudo iniciar sesión. Intenta de nuevo."))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="flex min-h-dvh flex-col bg-canvas">
      <header className="mx-auto flex w-full max-w-6xl flex-col items-center gap-2 px-4 pt-8 text-center sm:px-6 lg:flex-row lg:gap-4 lg:px-10 lg:text-left">
        <div className="rounded-xl bg-plate px-4 py-2.5">
          <Image
            src="/LogoRestaurantOS.png"
            alt="RestaurantOS"
            width={581}
            height={152}
            className="h-11 w-auto sm:h-12"
            priority
          />
        </div>
        <p className="text-soft">Gestiona tu restaurante fácilmente</p>
      </header>

      {/* content-center: en la tablet vertical las dos filas quedan juntas en el centro, sin un hueco entre ellas */}
      <div className="mx-auto grid w-full max-w-6xl flex-1 content-center items-center gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:gap-14 lg:px-10">
        <LoginIllustration className="mx-auto hidden h-auto w-full max-w-[460px] sm:block lg:max-w-[600px]" />

        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="fade-up mx-auto flex w-full max-w-[440px] flex-col gap-4 rounded-2xl border border-line bg-surface p-6 shadow-2xl shadow-black/40 sm:p-9"
        >
          <div className="mb-2">
            <h1 className="font-display text-[1.9rem] font-extrabold leading-tight">
              Hola,<br />qué bueno verte
            </h1>
            <p className="mt-2 text-soft">
              ¿Primera vez aquí? <span className="font-semibold text-brand">Pide tu cuenta</span> al administrador de tu restaurante.
            </p>
          </div>

          {notice && (
            <p role="status" className="rounded-md bg-warn/15 px-3 py-2.5 text-[15px] text-warn">{notice}</p>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="sr-only">Correo</span>
            <Input
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              placeholder="Correo"
              className={pill}
              aria-invalid={!!errors.email}
              {...register("email")}
            />
            {errors.email && <span className="px-5 text-sm text-bad">{errors.email.message}</span>}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="sr-only">Contraseña</span>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Contraseña"
                className={`${pill} pr-14`}
                aria-invalid={!!errors.password}
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                className="absolute right-1.5 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full text-soft hover:text-ink"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.password && <span className="px-5 text-sm text-bad">{errors.password.message}</span>}
          </label>

          <div className="flex flex-wrap items-center justify-between gap-x-4 px-1">
            <label className="flex min-h-11 items-center gap-2.5 text-[15px] text-soft">
              <input type="checkbox" className="size-4 accent-brand" {...register("remember")} />
              Recordar mi correo
            </label>
            <button
              type="button"
              onClick={() => setShowHelp(s => !s)}
              aria-expanded={showHelp}
              aria-controls="forgot-help"
              className="min-h-11 text-[15px] font-semibold text-brand underline underline-offset-4 hover:brightness-110"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>

          {showHelp && (
            <p id="forgot-help" className="rounded-md bg-brand/10 px-4 py-2.5 text-[15px]">
              Pídele al administrador de tu restaurante que te la restablezca desde <span className="font-semibold">Empleados</span>. Después entras con la nueva.
            </p>
          )}

          {serverError && (
            <p role="alert" className="rounded-md bg-bad/10 px-3 py-2.5 text-[15px] text-bad">
              {serverError}
            </p>
          )}

          <Button type="submit" size="lg" loading={isLoading} className="mt-1 w-full rounded-full uppercase tracking-[0.08em]">
            {isLoading ? "Ingresando..." : "Ingresar"}
          </Button>
        </form>
      </div>
    </main>
  )
}
