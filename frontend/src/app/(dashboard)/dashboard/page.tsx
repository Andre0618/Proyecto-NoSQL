"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Moon, Trash2 } from "lucide-react"

import api from "@/lib/axios"
import { useCurrentUser } from "@/lib/auth"
import { hasFeature } from "@/lib/tenant"
import { apiMessage } from "@/lib/errors"
import { cop, copMinus, shortDate, timeOfDay } from "@/lib/format"
import { cn } from "@/lib/utils"
import type {
  CashMovement, DailySummary, DashboardStats, EmployeePayment, Order, SummaryChart,
} from "@/types/api"
import TopBar from "@/components/ui/layout/TopBar"
import { OPEN_CLOSE_DAY_EVENT } from "@/components/ui/layout/DayActions"
import BarChart from "@/components/ui/BarChart"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"

type Metric = "ventas" | "neto" | "pedidos"
type Period = "week" | "month"

const PAY_TONE = { Efectivo: "good", Bancolombia: "warn", Datafono: "warn", Nequi: "brand", Mixto: "soft" } as const

const METRICS: { value: Metric; label: string }[] = [
  { value: "ventas", label: "Ventas" },
  { value: "neto", label: "Neto" },
  { value: "pedidos", label: "Pedidos" },
]

// $1,5 M, $800 mil: rótulos cortos para el eje
const compactMoney = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1).replace(".", ",")} M`
  if (v >= 1_000) return `$${Math.round(v / 1_000)} mil`
  return `$${v}`
}

const sum = <T,>(items: T[], pick: (item: T) => number) => items.reduce((s, i) => s + pick(i), 0)

export default function DashboardPage() {
  const toast = useToast()
  const { user, token, restaurantId } = useCurrentUser()
  // sin esa funcionalidad en el plan, el servidor rechaza esas dos consultas: ni se piden
  const hasCash = hasFeature(user, "cash_management")
  const restaurantName = user?.restaurantName ?? ""

  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [history, setHistory] = useState<Order[]>([])
  const [summaries, setSummaries] = useState<DailySummary[]>([])
  const [movements, setMovements] = useState<CashMovement[]>([])
  const [payments, setPayments] = useState<EmployeePayment[]>([])
  const [chartData, setChartData] = useState<SummaryChart[]>([])
  const [loaded, setLoaded] = useState(false)

  const [period, setPeriod] = useState<Period>("week")
  const [metric, setMetric] = useState<Metric>("ventas")
  const [reloadKey, setReloadKey] = useState(0)

  const [deleteTarget, setDeleteTarget] = useState<DailySummary | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const onDayClosed = () => {
      setHistory([])
      setStats(null)
      setReloadKey(k => k + 1)
    }
    window.addEventListener("day-closed", onDayClosed)
    return () => window.removeEventListener("day-closed", onDayClosed)
  }, [])

  const loadToday = useCallback(async () => {
    if (!restaurantId) return
    const results = await Promise.allSettled([
      api.get(`orders/stats/${restaurantId}`),
      api.get(`orders/history/${restaurantId}`),
      api.get(`daily-summary/history/${restaurantId}`),
      hasCash ? api.get(`cash-movements/${restaurantId}`) : Promise.resolve({ data: [] }),
      hasCash ? api.get(`employee-payments/${restaurantId}`) : Promise.resolve({ data: [] }),
    ])
    const [s, h, sm, mv, pay] = results
    if (s.status === "fulfilled") setStats(s.value.data)
    if (h.status === "fulfilled") setHistory(h.value.data)
    if (sm.status === "fulfilled") setSummaries(sm.value.data)
    if (mv.status === "fulfilled") setMovements(mv.value.data)
    if (pay.status === "fulfilled") setPayments(pay.value.data)
    const failed = results.find(r => r.status === "rejected") as PromiseRejectedResult | undefined
    if (failed) toast.error(apiMessage(failed.reason, "No se pudieron cargar algunos datos del dashboard."))
    setLoaded(true)
  }, [restaurantId, hasCash, toast])

  useEffect(() => {
    if (!restaurantId || !token) return
    loadToday()
  }, [restaurantId, token, reloadKey, loadToday])

  // se actualiza solo cada 30 s mientras la pestaña está a la vista
  useEffect(() => {
    if (!restaurantId || !token) return
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") loadToday()
    }, 30_000)
    return () => window.clearInterval(id)
  }, [restaurantId, token, loadToday])

  useEffect(() => {
    if (!restaurantId || !token) return
    api.get(`daily-summary/chart/${restaurantId}?period=${period}`)
      .then(r => setChartData(r.data))
      .catch(() => setChartData([]))
  }, [restaurantId, token, period, reloadKey])

  // "hoy" es desde el último cierre y no el día del calendario; si no, una venta de las 11:58 p. m. se pierde a medianoche
  const periodStart = stats ? new Date(stats.periodStart).getTime() : Infinity
  const afterClose = (createdAt: string) => new Date(createdAt).getTime() > periodStart
  const lastCloseAt = stats?.lastCloseAt ?? null
  const justClosed = lastCloseAt !== null && Date.now() - new Date(lastCloseAt).getTime() < 12 * 60 * 60 * 1000

  const ventas = stats?.totalIngresos ?? 0
  const pedidos = stats?.totalPedidos ?? 0
  const platos = stats?.totalPlatos ?? 0
  const propinasCobradas = stats?.totalPropinas ?? 0

  const todayMovements = movements.filter(m => afterClose(m.createdAt))
  const movementTotal = (type: CashMovement["type"]) =>
    sum(todayMovements.filter(m => m.type === type), m => m.amount)
  const base = movementTotal("BASE_CAJA")
  const gastos = movementTotal("GASTO")
  const compras = movementTotal("COMPRA")
  const sueldos = sum(payments.filter(p => afterClose(p.createdAt)), p => p.salary)

  const neto = ventas + base - gastos - compras - sueldos

  const bars = useMemo(() => chartData.map(d => {
    const [, month, day] = d.date.slice(0, 10).split("-")
    const value = metric === "ventas" ? d.efectivo + d.bancolombia + d.nequi : metric === "neto" ? d.ingresos : d.pedidos
    return { label: `${day}/${month}`, value }
  }), [chartData, metric])

  const confirmDeleteSummary = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`daily-summary/entry/${deleteTarget.id}`)
      setSummaries(prev => prev.filter(s => s.id !== deleteTarget.id))
      setReloadKey(k => k + 1)
      toast.success("Cierre eliminado del historial.")
    } catch (err) {
      toast.error(apiMessage(err, "No se pudo eliminar el cierre."))
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  const tabBtn = (active: boolean) => cn(
    "h-9 rounded-md px-3 text-sm font-semibold transition-colors",
    active ? "bg-brand text-brand-ink" : "text-soft hover:text-ink"
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar title="Dashboard">
        <Button variant="hot" onClick={() => window.dispatchEvent(new Event(OPEN_CLOSE_DAY_EVENT))}>
          <Moon size={17} /> <span className="max-sm:hidden">Cerrar el día</span><span className="sm:hidden">Cerrar</span>
        </Button>
      </TopBar>

      <div className="flex-1 overflow-y-auto px-4 pb-10 pt-2 md:px-7">
        <section className="mb-6">
          <p className="text-soft">
            Resumen de hoy en{" "}
            <span suppressHydrationWarning className="font-semibold text-ink">{restaurantName || "tu restaurante"}</span>
          </p>
          <p className="mt-1 font-display text-[clamp(1.6rem,4.5vw,2.4rem)] font-medium leading-tight">
            {ventas > 0 ? (
              <>Van <strong className="font-extrabold text-brand tnum">{cop(ventas)}</strong> en ventas hoy</>
            ) : loaded ? (
              <>{justClosed ? "Día cerrado, empezamos de cero" : "Todavía no hay ventas hoy"}</>
            ) : (
              <span className="text-faint">Cargando el día...</span>
            )}
          </p>
          <p className="mt-1.5 text-soft">
            {pedidos} {pedidos === 1 ? "orden cerrada" : "órdenes cerradas"}, {platos} {platos === 1 ? "plato" : "platos"}
            {stats ? ` y ${stats.mesasOcupadas} de ${stats.totalMesas} mesas ocupadas.` : "."}
          </p>
          {justClosed && lastCloseAt && (
            <p className="mt-1 text-sm text-good">
              El día se cerró a las {timeOfDay(lastCloseAt)} y quedó guardado en el historial. Lo que entre ahora cuenta para el siguiente cierre.
            </p>
          )}
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] xl:items-start">
          <div className="flex min-w-0 flex-col gap-5">
            <section className="rounded-lg bg-surface px-4 pb-3 pt-4 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-bold">Ventas archivadas</h2>
                  <p className="text-sm text-soft">Un cierre por día. El más reciente va en naranja.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="flex gap-1 rounded-lg bg-canvas/60 p-1" role="group" aria-label="Qué mostrar">
                    {METRICS.map(m => (
                      <button key={m.value} onClick={() => setMetric(m.value)} aria-pressed={metric === m.value} className={tabBtn(metric === m.value)}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1 rounded-lg bg-canvas/60 p-1" role="group" aria-label="Periodo">
                    {([["week", "7 días"], ["month", "30 días"]] as const).map(([value, label]) => (
                      <button key={value} onClick={() => setPeriod(value)} aria-pressed={period === value} className={tabBtn(period === value)}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-3">
                {bars.length > 0 ? (
                  <BarChart
                    data={bars}
                    format={metric === "pedidos" ? String : compactMoney}
                    ariaLabel={`Gráfica de ${METRICS.find(m => m.value === metric)?.label.toLowerCase()} de los últimos ${period === "week" ? "7" : "30"} días`}
                  />
                ) : (
                  <div className="grid h-44 place-items-center text-soft">Aún no hay cierres en este periodo.</div>
                )}
              </div>
            </section>

            <section className="rounded-lg bg-surface px-4 py-4 sm:px-5">
              <h2 className="font-display text-lg font-bold">Ventas de hoy</h2>
              <p className="text-sm text-soft">Órdenes cerradas que aún no se archivaron con el cierre del día.</p>
              {history.length === 0 ? (
                <p className="py-8 text-center text-soft">No hay ventas cerradas pendientes de archivar.</p>
              ) : (
                <ul className="mt-2 max-h-[30rem] overflow-y-auto">
                  {history.map(order => (
                    <li key={order.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-t border-line py-3 first:border-0">
                      <span className="row-span-2 grid size-10 place-items-center rounded-full bg-surface-2 font-display font-bold tnum">
                        {order.table?.number ?? "–"}
                      </span>
                      <span className="truncate font-semibold">
                        {order.items.map(i => `${i.product.name} ×${i.quantity}`).join(", ")}
                      </span>
                      <span className="row-span-2 text-right font-display font-bold tnum">{cop(order.total)}</span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-soft">
                        {timeOfDay(order.createdAt)}
                        {order.paymentMethod && (
                          <Badge tone={PAY_TONE[order.paymentMethod as keyof typeof PAY_TONE] ?? "soft"}>{order.paymentMethod}</Badge>
                        )}
                        {order.tip ? <span>propina {cop(order.tip)}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <section className="rounded-lg bg-surface px-4 py-4 sm:px-5">
              <h2 className="font-display text-lg font-bold">Caja del día</h2>
              <dl className="mt-2 text-[15px]">
                <Row label="Ventas" value={cop(ventas)} />
                <Row label="Base de caja" value={`+ ${cop(base)}`} />
                <Row label="Gastos" value={copMinus(gastos)} muted />
                <Row label="Compras" value={copMinus(compras)} muted />
                <Row label="Sueldos pagados" value={copMinus(sueldos)} muted />
                <div className="mt-2 flex items-baseline justify-between border-t-2 border-ink/80 pt-3">
                  <dt className="font-display text-base font-bold">Neto del día</dt>
                  <dd className={cn("font-display text-2xl font-extrabold tnum", neto < 0 ? "text-bad" : "text-brand")}>{cop(neto)}</dd>
                </div>
              </dl>
            </section>

            <section className="rounded-lg bg-surface-2 px-4 py-4 sm:px-5">
              <h2 className="font-display text-base font-bold">Propinas de hoy</h2>
              <p className="text-sm text-soft">Son del personal</p>
              <p className="mt-2 font-display text-3xl font-extrabold tnum">{cop(propinasCobradas)}</p>
            </section>
          </div>
        </div>

        <section className="mt-5 rounded-lg bg-surface px-4 py-4 sm:px-5">
          <h2 className="font-display text-lg font-bold">Historial de cierres</h2>
          {summaries.length === 0 ? (
            <p className="py-8 text-center text-soft">Todavía no hay cierres registrados.</p>
          ) : (
            <>
              {/* tablet y escritorio */}
              <div className="mt-2 hidden overflow-x-auto md:block">
                <table className="w-full border-collapse text-[15px]">
                  <thead>
                    <tr className="text-left text-sm text-soft">
                      {["Fecha", "Órdenes", "Platos", "Propinas", "Gastos y compras", "Neto"].map((h, i) => (
                        <th key={h} className={cn("py-2 pr-4 font-semibold", i >= 1 && "text-right")}>{h}</th>
                      ))}
                      <th className="w-12" aria-label="Acciones" />
                    </tr>
                  </thead>
                  <tbody>
                    {summaries.map(s => {
                      const out = (s.totalGastos ?? 0) + (s.totalCompras ?? 0)
                      return (
                        <tr key={s.id} className="border-t border-line">
                          <td className="py-3 pr-4 text-soft">{shortDate(s.date)}</td>
                          <td className="py-3 pr-4 text-right font-semibold tnum">{s.totalOrdenes}</td>
                          <td className="py-3 pr-4 text-right text-soft tnum">{s.totalPlatos}</td>
                          <td className="py-3 pr-4 text-right tnum">{cop(s.totalPropinas)}</td>
                          <td className="py-3 pr-4 text-right text-soft tnum">{out > 0 ? copMinus(out) : "–"}</td>
                          <td className="py-3 pr-4 text-right font-display font-bold tnum">{cop(s.totalIngresos)}</td>
                          <td className="py-1 text-right">
                            <button
                              onClick={() => setDeleteTarget(s)}
                              aria-label={`Eliminar el cierre del ${shortDate(s.date)}`}
                              className="grid size-10 place-items-center rounded-md text-faint transition-colors hover:bg-bad/15 hover:text-bad"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* celular */}
              <ul className="mt-2 md:hidden">
                {summaries.map(s => (
                  <li key={s.id} className="flex items-center gap-3 border-t border-line py-3 first:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{shortDate(s.date)}</p>
                      <p className="text-sm text-soft">{s.totalOrdenes} órdenes · {s.totalPlatos} platos</p>
                    </div>
                    <span className="font-display font-bold tnum">{cop(s.totalIngresos)}</span>
                    <button
                      onClick={() => setDeleteTarget(s)}
                      aria-label={`Eliminar el cierre del ${shortDate(s.date)}`}
                      className="grid size-10 place-items-center rounded-md text-faint hover:bg-bad/15 hover:text-bad"
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <p className="mt-8 text-center text-sm text-faint">
          Sistema desarrollado por <span className="font-semibold text-soft">@JuanCVO</span>
        </p>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="¿Eliminar este cierre?"
        message={deleteTarget ? `Se quita del historial el cierre del ${shortDate(deleteTarget.date)}. No se puede deshacer.` : ""}
        confirmLabel="Sí, eliminar"
        loading={deleting}
        onConfirm={confirmDeleteSummary}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

function Row({ label, value, muted, plain }: { label: string; value: string; muted?: boolean; plain?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-2", !plain && "border-b border-dotted border-line")}>
      <dt>{label}</dt>
      <dd className={cn("font-semibold tnum", muted && "text-soft")}>{value}</dd>
    </div>
  )
}
