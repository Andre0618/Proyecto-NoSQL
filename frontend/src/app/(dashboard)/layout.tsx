"use client"

import { useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Loader2 } from "lucide-react"

import Sidebar from "@/components/ui/layout/Sidebar"
import PrinterModal from "@/components/ui/printer-modal"
import api from "@/lib/axios"
import { endSession, isSessionExpired, setSession, tokenExpiresAt, useCurrentUser } from "@/lib/auth"
import { hasFeature } from "@/lib/tenant"
import type { Feature, TenantConfig } from "@/types/api"

const ADMIN_ONLY = ["/dashboard", "/inventory", "/purchases", "/employees"]
// pantallas que existen solo si el plan del restaurante incluye la funcionalidad
const FEATURE_ROUTES: Record<string, Feature> = { "/purchases": "cash_management" }

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const { user, token, ready } = useCurrentUser()
  // Los efectos de la página corren antes que los del layout: si un mesero alcanzara a montar una pantalla
  // de admin, sus peticiones saldrían antes de la redirección y volverían con «Acceso denegado».
  const roleBlocked = user?.role === "EMPLOYEE" && ADMIN_ONLY.some(p => pathname.startsWith(p))
  const planBlocked = !roleBlocked && Object.entries(FEATURE_ROUTES).some(([p, f]) => pathname.startsWith(p) && !hasFeature(user, f))
  const blocked = roleBlocked || planBlocked

  useEffect(() => {
    if (!ready) return
    if (!token) router.replace("/login")
    else if (roleBlocked) router.replace("/tables")
    else if (planBlocked) router.replace("/dashboard")
  }, [ready, token, roleBlocked, planBlocked, router])

  // El plan se guardó al iniciar sesión y puede haber cambiado (o la sesión es de antes de existir los planes):
  // se vuelve a pedir al abrir para que el menú muestre lo que el restaurante tiene hoy.
  useEffect(() => {
    if (!ready || !token || !user) return
    let cancelled = false
    api.get<TenantConfig>("/tenant")
      .then(({ data }) => {
        if (cancelled || JSON.stringify(data) === JSON.stringify(user.tenant)) return
        setSession(token, { ...user, tenant: data })
      })
      .catch(() => { /* sin red o sesión vencida: el interceptor ya se encarga; se sigue con lo guardado */ })
    return () => { cancelled = true }
    // solo al abrir la sesión: cambiar `user` por guardar el plan no debe volver a pedirlo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, token, user?.id])

  // Una pantalla que se queda abierta (una tablet toda la noche) no hace peticiones que fallen por sí solas.
  // Por eso se vigila el vencimiento del token: al llegar la hora, al volver a la pestaña y cada minuto.
  useEffect(() => {
    if (!ready || !token) return
    const check = () => { if (isSessionExpired(token)) endSession() }
    check()
    const at = tokenExpiresAt(token)
    const timer = at !== null ? window.setTimeout(check, Math.max(at - Date.now(), 0) + 500) : undefined
    const interval = window.setInterval(check, 60_000)
    document.addEventListener("visibilitychange", check)
    window.addEventListener("focus", check)
    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", check)
      window.removeEventListener("focus", check)
    }
  }, [ready, token])

  // evita mostrar pantallas a medias mientras se lee la sesión o se redirige
  if (!ready || !token || blocked) {
    return (
      <div className="grid h-dvh place-items-center bg-canvas">
        <Loader2 className="animate-spin text-soft" size={28} aria-label="Cargando" />
      </div>
    )
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <Sidebar />
      {user?.role === "ADMIN" && <PrinterModal />}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </main>
    </div>
  )
}
