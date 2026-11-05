"use client"

import { useCallback, useEffect, useState } from "react"
import { ShoppingCart, Trash2, TrendingDown, Users, Wallet } from "lucide-react"

import api from "@/lib/axios"
import { useCurrentUser } from "@/lib/auth"
import { apiMessage } from "@/lib/errors"
import { cop, timeOfDay } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { CashMovement, Employee, EmployeePayment, MovementType } from "@/types/api"
import TopBar from "@/components/ui/layout/TopBar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Field, Input, Select } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"

const TYPE_LABELS: Record<MovementType, string> = {
  COMPRA: "Compra",
  GASTO: "Gasto",
  BASE_CAJA: "Base de caja",
}

const TYPE_TONE: Record<MovementType, "brand" | "bad" | "good"> = {
  COMPRA: "brand",
  GASTO: "bad",
  BASE_CAJA: "good",
}

type DeleteTarget =
  | { kind: "movement"; id: string; label: string }
  | { kind: "payment"; id: string; label: string }

const sum = <T,>(items: T[], pick: (item: T) => number) => items.reduce((s, i) => s + pick(i), 0)

export default function PurchasesPage() {
  const toast = useToast()
  const { token, restaurantId } = useCurrentUser()

  const [movements, setMovements] = useState<CashMovement[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [payments, setPayments] = useState<EmployeePayment[]>([])
  const [savingMovement, setSavingMovement] = useState(false)
  const [savingBase, setSavingBase] = useState(false)
  const [savingPayment, setSavingPayment] = useState(false)

  const [type, setType] = useState<MovementType>("COMPRA")
  const [concept, setConcept] = useState("")
  const [amount, setAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("Efectivo")
  const [notes, setNotes] = useState("")
  const [baseCajaAmount, setBaseCajaAmount] = useState("")

  const [selectedEmployee, setSelectedEmployee] = useState("")
  const [salary, setSalary] = useState("")
  const [tipPago, setTipPago] = useState("")
  // el efectivo sale de la caja y se descuenta en el cierre de caja; Nequi o Bancolombia no
  const [methodPago, setMethodPago] = useState("Efectivo")
  const [notesPago, setNotesPago] = useState("")

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchMovements = useCallback(async () => {
    const res = await api.get(`/cash-movements/${restaurantId}`)
    setMovements(res.data)
  }, [restaurantId])

  // "hoy" empieza en el último cierre
  const [periodFrom, setPeriodFrom] = useState<number | null>(null)
  const fetchPeriod = useCallback(async () => {
    const res = await api.get(`/daily-summary/period/${restaurantId}`)
    setPeriodFrom(new Date(res.data.from).getTime())
  }, [restaurantId])

  const fetchPayments = useCallback(async () => {
    const res = await api.get(`/employee-payments/${restaurantId}`)
    setPayments(res.data)
  }, [restaurantId])

  useEffect(() => {
    if (!restaurantId || !token) return
    fetchMovements().catch(err => toast.error(apiMessage(err, "No se pudieron cargar los movimientos.")))
    fetchPayments().catch(err => toast.error(apiMessage(err, "No se pudieron cargar los pagos.")))
    fetchPeriod().catch(() => {})
    api.get(`/auth/users/${restaurantId}`)
      .then(res => setEmployees(res.data))
      .catch(() => {})
  }, [restaurantId, token, fetchMovements, fetchPayments, fetchPeriod, toast])

  useEffect(() => {
    const reload = () => {
      if (!restaurantId) return
      fetchMovements().catch(() => {})
      fetchPayments().catch(() => {})
      fetchPeriod().catch(() => {})
    }
    window.addEventListener("day-closed", reload)
    return () => window.removeEventListener("day-closed", reload)
  }, [restaurantId, fetchMovements, fetchPayments, fetchPeriod])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!concept.trim() || !amount) return
    setSavingMovement(true)
    try {
      await api.post("/cash-movements", {
        type, concept: concept.trim(), amount: Number(amount), paymentMethod, notes, restaurantId,
      })
      setConcept("")
      setAmount("")
      setNotes("")
      await fetchMovements()
      toast.success(`${TYPE_LABELS[type]} registrada.`)
    } catch (err) {
      toast.error(apiMessage(err, "No se pudo registrar el movimiento."))
    } finally {
      setSavingMovement(false)
    }
  }

  const handleBaseSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!baseCajaAmount) return
    setSavingBase(true)
    try {
      await api.post("/cash-movements", {
        type: "BASE_CAJA",
        concept: "Base de caja",
        amount: Number(baseCajaAmount),
        paymentMethod: "Efectivo",
        restaurantId,
      })
      setBaseCajaAmount("")
      await fetchMovements()
      toast.success("Base de caja registrada.")
    } catch (err) {
      toast.error(apiMessage(err, "No se pudo registrar la base de caja."))
    } finally {
      setSavingBase(false)
    }
  }

  const handlePagoSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!selectedEmployee || !salary) return
    setSavingPayment(true)
    try {
      await api.post("/employee-payments", {
        userId: selectedEmployee,
        restaurantId,
        salary: Number(salary),
        tip: Number(tipPago || 0),
        paymentMethod: methodPago,
        notes: notesPago || null,
      })
      setSelectedEmployee("")
      setSalary("")
      setTipPago("")
      setNotesPago("")
      await fetchPayments()
      toast.success("Pago registrado.")
    } catch (err) {
      toast.error(apiMessage(err, "No se pudo registrar el pago."))
    } finally {
      setSavingPayment(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      if (deleteTarget.kind === "movement") {
        await api.delete(`/cash-movements/${deleteTarget.id}`)
        setMovements(prev => prev.filter(m => m.id !== deleteTarget.id))
      } else {
        await api.delete(`/employee-payments/${deleteTarget.id}`)
        setPayments(prev => prev.filter(p => p.id !== deleteTarget.id))
      }
      toast.success("Registro eliminado.")
    } catch (err) {
      toast.error(apiMessage(err, "No se pudo eliminar el registro."))
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  const movementsToday = periodFrom === null ? [] : movements.filter(m => new Date(m.createdAt).getTime() > periodFrom)
  const totalOf = (t: MovementType) => sum(movementsToday.filter(m => m.type === t), m => m.amount)
  const totalCompras = totalOf("COMPRA")
  const totalGastos = totalOf("GASTO")
  const baseCaja = totalOf("BASE_CAJA")
  const baseCajaYaRegistrada = movementsToday.some(m => m.type === "BASE_CAJA")
  const totalSueldos = sum(payments, p => p.salary)
  const totalPropinas = sum(payments, p => p.tip)

  const statCards = [
    { title: "Compras hoy", value: cop(totalCompras), icon: ShoppingCart, tone: "text-brand bg-brand/15" },
    { title: "Gastos hoy", value: cop(totalGastos), icon: TrendingDown, tone: "text-bad bg-bad/15" },
    { title: "Base de caja", value: cop(baseCaja), icon: Wallet, tone: "text-good bg-good/15" },
    { title: "Sueldos hoy", value: cop(totalSueldos), icon: Users, tone: "text-hot bg-hot/20" },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar title="Compras y gastos" />

      <div className="flex-1 overflow-y-auto px-4 pb-10 pt-2 md:px-7">
        <p className="mb-5 max-w-2xl text-soft">
          Todo lo que registres hoy se descuenta de la caja al cerrar el día: gastos, compras y sueldos.
        </p>

        <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {statCards.map(s => {
            const Icon = s.icon
            return (
              <div key={s.title} className="flex items-center gap-3 rounded-lg bg-surface p-4">
                <span className={cn("grid size-11 shrink-0 place-items-center rounded-md", s.tone)}><Icon size={20} /></span>
                <div className="min-w-0">
                  <p className="text-sm text-soft">{s.title}</p>
                  <p className="truncate font-display text-xl font-bold tnum">{s.value}</p>
                </div>
              </div>
            )
          })}
        </div>

        <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
          <section className="flex flex-col gap-5 rounded-lg bg-surface p-4 sm:p-5">
            <h2 className="font-display text-lg font-bold">Registrar movimiento</h2>

            {!baseCajaYaRegistrada ? (
              <form onSubmit={handleBaseSubmit} className="flex flex-col gap-3 rounded-lg bg-good/10 p-4 sm:flex-row sm:items-end">
                <div className="flex flex-1 items-start gap-3">
                  <Wallet size={20} className="mt-0.5 shrink-0 text-good" aria-hidden />
                  <div>
                    <p className="font-semibold">Base de caja</p>
                    <p className="text-sm text-soft">Dinero inicial en caja para dar vueltos. Solo se registra una vez al día.</p>
                  </div>
                </div>
                <div className="flex gap-2 sm:w-72">
                  <Input
                    type="number" inputMode="numeric" min={1} required
                    value={baseCajaAmount} onChange={e => setBaseCajaAmount(e.target.value)}
                    placeholder="Monto ($)" aria-label="Monto de la base de caja"
                  />
                  <Button type="submit" variant="success" loading={savingBase} disabled={!baseCajaAmount}>Registrar</Button>
                </div>
              </form>
            ) : (
              <div className="flex items-center gap-3 rounded-lg bg-good/10 p-4">
                <Wallet size={20} className="shrink-0 text-good" aria-hidden />
                <div>
                  <p className="font-semibold text-good">Base de caja ya registrada hoy</p>
                  <p className="text-sm text-soft tnum">{cop(baseCaja)} · no se puede modificar</p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
              <Field label="Tipo">
                <Select value={type} onChange={e => setType(e.target.value as MovementType)}>
                  <option value="COMPRA">Compra (ingredientes, gaseosas...)</option>
                  <option value="GASTO">Gasto (domicilios, servicios...)</option>
                </Select>
              </Field>
              <Field label="Método de pago">
                <Select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Nequi">Nequi</option>
                  <option value="Bancolombia">Bancolombia</option>
                </Select>
              </Field>
              <Field label="Concepto" className="sm:col-span-2">
                <Input value={concept} onChange={e => setConcept(e.target.value)} placeholder="Ej. Gaseosas, arroz, domicilio" required />
              </Field>
              <Field label="Monto ($)">
                <Input type="number" inputMode="numeric" min={1} value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" required />
              </Field>
              <Field label="Notas (opcional)">
                <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observación adicional" />
              </Field>
              <Button type="submit" size="lg" loading={savingMovement} className="sm:col-span-2">
                {savingMovement ? "Guardando..." : `Registrar ${TYPE_LABELS[type].toLowerCase()}`}
              </Button>
            </form>
          </section>

          <section className="flex flex-col gap-5 rounded-lg bg-surface p-4 sm:p-5">
            <h2 className="font-display text-lg font-bold">Pagos a empleados</h2>

            <form onSubmit={handlePagoSubmit} className="grid gap-4 sm:grid-cols-2">
              <Field label="Empleado" className="sm:col-span-2">
                <Select value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)} required>
                  <option value="">Seleccionar empleado...</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.role === "ADMIN" ? "Admin" : "Empleado"})</option>
                  ))}
                </Select>
              </Field>
              <Field label="Pago del día ($)" hint={methodPago === "Efectivo" ? "Sale de la caja de hoy" : "Por transferencia: no sale de la caja"}>
                <Input type="number" inputMode="numeric" min={0} value={salary} onChange={e => setSalary(e.target.value)} placeholder="0" required />
              </Field>
              <Field label="Propina entregada ($)" hint="No cuenta como gasto">
                <Input type="number" inputMode="numeric" min={0} value={tipPago} onChange={e => setTipPago(e.target.value)} placeholder="0" />
              </Field>
              <Field label="¿Cómo se le pagó?" className="sm:col-span-2">
                <Select value={methodPago} onChange={e => setMethodPago(e.target.value)}>
                  <option value="Efectivo">Efectivo (sale de la caja)</option>
                  <option value="Nequi">Nequi</option>
                  <option value="Bancolombia">Bancolombia</option>
                </Select>
              </Field>
              <Field label="Notas (opcional)" className="sm:col-span-2">
                <Input value={notesPago} onChange={e => setNotesPago(e.target.value)} placeholder="Observación" />
              </Field>
              <Button type="submit" size="lg" loading={savingPayment} disabled={!selectedEmployee || !salary} className="sm:col-span-2">
                {savingPayment ? "Guardando..." : "Registrar pago"}
              </Button>
            </form>

            <div>
              <h3 className="mb-2 font-display text-base font-bold">Pagos de hoy</h3>
              {payments.length === 0 ? (
                <p className="rounded-lg bg-canvas/60 py-6 text-center text-soft">No hay pagos registrados hoy.</p>
              ) : (
                <ul className="rounded-lg bg-canvas/60">
                  {payments.map(p => (
                    <li key={p.id} className="flex items-center gap-3 border-t border-line px-4 py-3 first:border-0">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{p.user.name}</p>
                        <p className="text-sm text-soft tnum">
                          Pago {cop(p.salary)}
                          {p.tip > 0 && ` · Propina ${cop(p.tip)}`}
                          {` · ${p.paymentMethod}`}
                          {p.notes && ` · ${p.notes}`}
                        </p>
                      </div>
                      <span className="font-display font-bold tnum">{cop(p.salary + p.tip)}</span>
                      <button
                        onClick={() => setDeleteTarget({ kind: "payment", id: p.id, label: `el pago de ${p.user.name}` })}
                        aria-label={`Eliminar el pago de ${p.user.name}`}
                        className="grid size-10 place-items-center rounded-md text-faint transition-colors hover:bg-bad/15 hover:text-bad"
                      >
                        <Trash2 size={16} />
                      </button>
                    </li>
                  ))}
                  <li className="flex justify-between border-t border-line px-4 py-3 text-[15px]">
                    <span className="text-soft">Sueldos {cop(totalSueldos)} · Propinas {cop(totalPropinas)}</span>
                  </li>
                </ul>
              )}
            </div>
          </section>
        </div>

        <section className="mt-5 rounded-lg bg-surface px-4 py-4 sm:px-5">
          <h2 className="font-display text-lg font-bold">Historial de movimientos</h2>
          {movements.length === 0 ? (
            <p className="py-10 text-center text-soft">Todavía no hay movimientos registrados.</p>
          ) : (
            <>
              <div className="mt-2 hidden overflow-x-auto md:block">
                <table className="w-full border-collapse text-[15px]">
                  <thead>
                    <tr className="text-left text-sm text-soft">
                      <th className="py-2 pr-4 font-semibold">Tipo</th>
                      <th className="py-2 pr-4 font-semibold">Concepto</th>
                      <th className="py-2 pr-4 font-semibold">Pago</th>
                      <th className="py-2 pr-4 font-semibold">Notas</th>
                      <th className="py-2 pr-4 font-semibold">Hora</th>
                      <th className="py-2 pr-4 text-right font-semibold">Monto</th>
                      <th className="w-12" aria-label="Acciones" />
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map(m => (
                      <tr key={m.id} className="border-t border-line">
                        <td className="py-3 pr-4"><Badge tone={TYPE_TONE[m.type]}>{TYPE_LABELS[m.type]}</Badge></td>
                        <td className="py-3 pr-4 font-semibold">{m.concept}</td>
                        <td className="py-3 pr-4 text-soft">{m.paymentMethod ?? "–"}</td>
                        <td className="py-3 pr-4 text-soft">{m.notes || "–"}</td>
                        <td className="py-3 pr-4 text-soft tnum">{timeOfDay(m.createdAt)}</td>
                        <td className="py-3 pr-4 text-right font-display font-bold tnum">{cop(m.amount)}</td>
                        <td className="py-1 text-right">
                          <button
                            onClick={() => setDeleteTarget({ kind: "movement", id: m.id, label: `"${m.concept}"` })}
                            aria-label={`Eliminar ${m.concept}`}
                            className="grid size-10 place-items-center rounded-md text-faint transition-colors hover:bg-bad/15 hover:text-bad"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="mt-2 md:hidden">
                {movements.map(m => (
                  <li key={m.id} className="flex items-center gap-3 border-t border-line py-3 first:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{m.concept}</p>
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-soft">
                        <Badge tone={TYPE_TONE[m.type]}>{TYPE_LABELS[m.type]}</Badge>
                        {m.paymentMethod ?? "–"} · {timeOfDay(m.createdAt)}
                      </p>
                    </div>
                    <span className="font-display font-bold tnum">{cop(m.amount)}</span>
                    <button
                      onClick={() => setDeleteTarget({ kind: "movement", id: m.id, label: `"${m.concept}"` })}
                      aria-label={`Eliminar ${m.concept}`}
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
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="¿Eliminar registro?"
        message={deleteTarget ? `Vas a eliminar ${deleteTarget.label}. Esta acción no se puede deshacer.` : ""}
        confirmLabel="Sí, eliminar"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
