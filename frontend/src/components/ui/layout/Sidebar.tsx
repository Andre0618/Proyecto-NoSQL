"use client"

import { useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import {
  LayoutDashboard, Package, UtensilsCrossed, LogOut, ChefHat, Calendar,
  TrendingUp, ShoppingCart, Moon, FileDown, Loader2, Users, Ellipsis, Printer,
  type LucideIcon,
} from "lucide-react"

import { useCurrentUser, clearSession } from "@/lib/auth"
import { OPEN_PRINTER_EVENT } from "@/lib/printer"
import { cn } from "@/lib/utils"
import { Modal } from "@/components/ui/modal"
import { hasFeature } from "@/lib/tenant"
import type { Feature } from "@/types/api"
import { useDayActions } from "@/components/ui/layout/DayActions"

type NavItem = { href: string; icon: LucideIcon; label: string; short: string; feature?: Feature }

const ADMIN_NAV: NavItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard",        short: "Inicio" },
  { href: "/tables",    icon: UtensilsCrossed, label: "Mesas",            short: "Mesas" },
  { href: "/inventory", icon: Package,         label: "Inventario",       short: "Inventario" },
  { href: "/purchases", icon: ShoppingCart,    label: "Compras y gastos", short: "Compras", feature: "cash_management" },
  { href: "/employees", icon: Users,           label: "Empleados",        short: "Equipo" },
]

const EMPLOYEE_NAV: NavItem[] = [
  { href: "/tables", icon: UtensilsCrossed, label: "Mesas", short: "Mesas" },
]

const SOON = [
  { icon: ChefHat,    label: "Cocina KDS" },
  { icon: Calendar,   label: "Reservaciones" },
  { icon: TrendingUp, label: "Reportes" },
]

// en celular la barra de abajo trae estos cuatro; el resto va en "Más"
const PHONE_PRIMARY = ["/dashboard", "/tables", "/inventory", "/purchases"]

const Logo = () => (
  <div className="rounded-lg bg-plate px-2 py-1.5">
    <Image src="/LogoRestaurantOS.png" alt="RestaurantOS" width={581} height={152} className="h-8 w-auto max-w-none" priority />
  </div>
)

// solo el gorro del logo, para el menú angosto
const LogoMark = () => (
  <div className="rounded-lg bg-plate p-1">
    <Image src="/LogoRestaurantOS.png" alt="RestaurantOS" width={581} height={152} className="size-9 object-cover object-left" priority />
  </div>
)

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, restaurantId, ready } = useCurrentUser()
  const [moreOpen, setMoreOpen] = useState(false)

  const isAdmin = user?.role === "ADMIN"
  const nav = isAdmin ? ADMIN_NAV.filter(item => !item.feature || hasFeature(user, item.feature)) : EMPLOYEE_NAV
  const canPdf = hasFeature(user, "pdf_reports")
  const userName = user?.name ?? ""

  const { openClose, openPdf, pdfLoading, modals } = useDayActions(restaurantId)

  const handleLogout = () => {
    clearSession()
    router.push("/login")
  }

  if (!ready) return null

  const isActive = (href: string) => pathname.startsWith(href)

  const avatar = (
    <div
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full font-display text-sm font-bold",
        isAdmin ? "bg-hot text-hot-ink" : "bg-brand text-brand-ink"
      )}
    >
      {userName.charAt(0).toUpperCase() || "?"}
    </div>
  )

  const actionBtn = "flex h-11 w-full items-center gap-3 rounded-md px-3 text-[15px] font-semibold text-soft transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-60 max-lg:justify-center max-lg:px-0"

  return (
    <>
      {/* tablet y escritorio */}
      <aside className="hidden h-dvh w-[76px] shrink-0 flex-col gap-4 bg-surface px-2.5 py-4 md:flex lg:w-[236px] lg:px-3.5">
        <div className="px-1 max-lg:flex max-lg:justify-center">
          <div className="hidden lg:block"><Logo /></div>
          <div className="lg:hidden"><LogoMark /></div>
        </div>

        <nav aria-label="Navegación principal" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pt-2">
          {nav.map(item => {
            const active = isActive(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-md px-3 text-[15px] font-semibold transition-colors max-lg:justify-center max-lg:px-0",
                  active ? "bg-brand/15 text-brand" : "text-soft hover:bg-surface-2 hover:text-ink"
                )}
              >
                <Icon size={19} className="shrink-0" />
                <span className="max-lg:hidden">{item.label}</span>
              </Link>
            )
          })}

          {isAdmin && (
            <div className="mt-5 hidden flex-col gap-1 lg:flex">
              <p className="px-3 pb-1 text-sm text-faint">Próximamente</p>
              {SOON.map(item => {
                const Icon = item.icon
                return (
                  <div key={item.label} className="flex h-10 items-center gap-3 px-3 text-sm text-faint">
                    <Icon size={17} />
                    {item.label}
                    <span className="ml-auto text-xs italic">pronto</span>
                  </div>
                )
              })}
            </div>
          )}
        </nav>

        <div className="flex flex-col gap-1 border-t border-line pt-3">
          {isAdmin && (
            <>
              <button
                onClick={() => window.dispatchEvent(new Event(OPEN_PRINTER_EVENT))}
                title="Impresora"
                aria-label="Impresora"
                className={actionBtn}
              >
                <Printer size={18} className="shrink-0" />
                <span className="max-lg:hidden">Impresora</span>
              </button>
              <button onClick={openClose} title="Cerrar día" aria-label="Cerrar día" className={cn(actionBtn, "text-hot hover:text-hot")}>
                <Moon size={18} className="shrink-0" />
                <span className="max-lg:hidden">Cerrar día</span>
              </button>
              {canPdf && (
                <button onClick={openPdf} disabled={pdfLoading} title="Descargar PDF" aria-label="Descargar PDF" className={actionBtn}>
                  {pdfLoading ? <Loader2 size={18} className="shrink-0 animate-spin" /> : <FileDown size={18} className="shrink-0" />}
                  <span className="max-lg:hidden">{pdfLoading ? "Descargando..." : "Descargar PDF"}</span>
                </button>
              )}
            </>
          )}

          <div className="mt-2 flex items-center gap-3 px-1 max-lg:justify-center">
            {avatar}
            <div className="min-w-0 max-lg:hidden">
              <p className="truncate text-[15px] font-semibold leading-tight">{userName || "Usuario"}</p>
              <p className="text-sm text-soft">{isAdmin ? "Administrador" : "Mesero"}</p>
            </div>
          </div>

          <button onClick={handleLogout} title="Cerrar sesión" aria-label="Cerrar sesión" className={cn(actionBtn, "hover:text-bad")}>
            <LogOut size={18} className="shrink-0" />
            <span className="max-lg:hidden">Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* celular */}
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {(isAdmin ? nav.filter(n => PHONE_PRIMARY.includes(n.href)) : nav).map(item => {
          const active = isActive(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors",
                active ? "text-brand" : "text-soft"
              )}
            >
              <Icon size={22} />
              {item.short}
            </Link>
          )
        })}
        <button
          onClick={isAdmin ? () => setMoreOpen(true) : handleLogout}
          aria-label={isAdmin ? "Más opciones" : "Cerrar sesión"}
          className={cn(
            "flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors",
            isAdmin && pathname.startsWith("/employees") ? "text-brand" : "text-soft"
          )}
        >
          {isAdmin ? <Ellipsis size={22} /> : <LogOut size={22} />}
          {isAdmin ? "Más" : "Salir"}
        </button>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title={userName || "Cuenta"} subtitle="Administrador" size="sm">
        <div className="flex flex-col gap-1 px-3 pb-4">
          <Link
            href="/employees"
            onClick={() => setMoreOpen(false)}
            className="flex h-12 items-center gap-3 rounded-md px-3 text-base font-semibold hover:bg-surface-2"
          >
            <Users size={20} className="text-soft" /> Empleados
          </Link>
          <button
            onClick={() => { setMoreOpen(false); openClose() }}
            className="flex h-12 items-center gap-3 rounded-md px-3 text-left text-base font-semibold text-hot hover:bg-surface-2"
          >
            <Moon size={20} /> Cerrar día
          </button>
          <button
            onClick={() => { setMoreOpen(false); window.dispatchEvent(new Event(OPEN_PRINTER_EVENT)) }}
            className="flex h-12 items-center gap-3 rounded-md px-3 text-left text-base font-semibold hover:bg-surface-2"
          >
            <Printer size={20} className="text-soft" /> Impresora
          </button>
          {canPdf && (
            <button
              onClick={() => { setMoreOpen(false); openPdf() }}
              className="flex h-12 items-center gap-3 rounded-md px-3 text-left text-base font-semibold hover:bg-surface-2"
            >
              <FileDown size={20} className="text-soft" /> Descargar PDF
            </button>
          )}
          <button
            onClick={handleLogout}
            className="flex h-12 items-center gap-3 rounded-md px-3 text-left text-base font-semibold text-bad hover:bg-surface-2"
          >
            <LogOut size={20} /> Cerrar sesión
          </button>
        </div>
      </Modal>

      {modals}
    </>
  )
}
