"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CheckCircle2, Loader2, Minus, Plus, Printer, Search, Trash2 } from "lucide-react"

import api from "@/lib/axios"
import { useCurrentUser } from "@/lib/auth"
import { tenantSettings } from "@/lib/tenant"
import { apiMessage } from "@/lib/errors"
import { cop, elapsed, isToday } from "@/lib/format"
import { cn } from "@/lib/utils"
import { OPEN_PRINTER_EVENT, PrinterError, usePrinter } from "@/lib/printer"
import { buildReceipt, suggestedTip, type ReceiptData } from "@/lib/receipt"
import { quickCashAmounts } from "@/lib/cash"
import type { Table, Order, OrderItem } from "@/types/api"
import TopBar from "@/components/ui/layout/TopBar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"

type Product = {
  id: string
  name: string
  price: number
  unit: string
  stock: number
  minStock: number
  category: { name: string } | null
}

type TableFilter = "all" | "busy" | "free"
type Pane = "products" | "account"

type ConfirmState = {
  title: string
  message: string
  confirmLabel: string
  tone: "danger" | "primary"
  onConfirm: () => Promise<void> | void
}

const PAYMENT_METHODS = ["Efectivo", "Nequi", "Bancolombia", "Mixto"] as const
const TRANSFER_METHODS = ["Nequi", "Bancolombia"] as const
const TIP_PRESETS = [0, 2000, 5000, 10000]

export default function TablesPage() {
  const toast = useToast()
  const { user, token, restaurantId } = useCurrentUser()
  const isAdmin = user?.role === "ADMIN"
  // propina sugerida y medios de pago son de cada restaurante
  const settings = tenantSettings(user)
  const paymentMethods = PAYMENT_METHODS.filter(m => settings.paymentMethods.includes(m))
  const transferMethods = TRANSFER_METHODS.filter(m => settings.paymentMethods.includes(m))
  const printer = usePrinter()
  // los meseros piden desde el celular; la impresora está en la caja
  const canPrint = user?.role === "ADMIN"

  const [tables, setTables] = useState<Table[] | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [filter, setFilter] = useState<TableFilter>("all")
  const [tableSearch, setTableSearch] = useState("")
  const [now, setNow] = useState(() => Date.now())
  const [creatingTable, setCreatingTable] = useState(false)
  const [openingId, setOpeningId] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [selectedTable, setSelectedTable] = useState<Table | null>(null)
  const [activeOrder, setActiveOrder] = useState<Order | null>(null)
  const [pane, setPane] = useState<Pane>("products")
  const [productSearch, setProductSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("Todas")
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [pending, setPending] = useState(0)
  // cuántos «agregar» van en vuelo; el estado de arriba pinta la pantalla, esta cuenta decide cuándo sincronizar
  const inFlight = useRef(0)
  const [showPayment, setShowPayment] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState("")
  // pago mixto: lo que se pagó en efectivo y por dónde se pagó el resto
  const [cashPaid, setCashPaid] = useState(0)
  const [transferMethod, setTransferMethod] = useState("")
  const [tipAmount, setTipAmount] = useState(0)
  // lo que se escribe en «Otro valor»; aparte de tipAmount para no borrar el campo mientras se teclea
  const [tipText, setTipText] = useState("")
  // pago en efectivo: con cuánto paga el cliente, para calcular la devuelta
  const [receivedText, setReceivedText] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)

  const fetchTables = useCallback(async () => {
    if (!restaurantId) return
    try {
      const res = await api.get(`/tables/${restaurantId}`)
      setTables(res.data)
    } catch {
      // si falla el refresco automático, no avisamos
    }
  }, [restaurantId])

  const fetchProducts = useCallback(async () => {
    if (!restaurantId) return
    try {
      const res = await api.get(`/products/${restaurantId}`)
      setProducts(res.data)
    } catch (err) {
      toast.error(apiMessage(err, "No se pudieron cargar los productos."))
    }
  }, [restaurantId, toast])

  useEffect(() => {
    if (!restaurantId || !token) return
    fetchTables()
    fetchProducts()
  }, [restaurantId, token, fetchTables, fetchProducts])

  // refresco automático para que varios meseros vean lo mismo
  useEffect(() => {
    if (!restaurantId || !token || modalOpen) return
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchTables()
        setNow(Date.now())
      }
    }, 15_000)
    return () => window.clearInterval(id)
  }, [restaurantId, token, modalOpen, fetchTables])

  const resetComanda = () => {
    setModalOpen(false)
    setActiveOrder(null)
    setSelectedTable(null)
    setShowPayment(false)
    setPaymentMethod("")
    setCashPaid(0)
    setTransferMethod("")
    setTipAmount(0)
    setTipText("")
    setReceivedText("")
    setProductSearch("")
    setCategoryFilter("Todas")
    setPane("products")
    setQuantities({})
  }

  const openTable = async (table: Table) => {
    if (openingId) return
    setOpeningId(table.id)
    try {
      const existing = await api.get(`/orders/table/${table.id}`)
      let order: Order | null = existing.data
      // una orden vacía de otro día se cancela y se abre una nueva; si no, la venta quedaría con fecha vieja y no saldría en el dashboard
      if (order && !order.items?.length && !isToday(order.createdAt)) {
        await api.patch(`/orders/${order.id}/cancel`)
        order = null
      }
      if (!order) {
        const created = await api.post("/orders", { tableId: table.id, restaurantId })
        order = { ...created.data, items: created.data.items ?? [] }
      }
      setSelectedTable(table)
      setActiveOrder(order)
      setPane("products")
      setShowPayment(false)
      setPaymentMethod("")
      setCashPaid(0)
      setTransferMethod("")
      setTipAmount(0)
      setTipText("")
      setReceivedText("")
      setModalOpen(true)
    } catch (err) {
      toast.error(apiMessage(err, "No se pudo abrir la mesa."))
    } finally {
      setOpeningId(null)
    }
  }

  const getQty = (productId: string) => quantities[productId] ?? 1
  const changeQty = (productId: string, delta: number) =>
    setQuantities(q => ({ ...q, [productId]: Math.max(1, (q[productId] ?? 1) + delta) }))

  // Lo que se ve es provisional mientras hay peticiones en vuelo. Al terminar la última, se vuelve a leer del
  // servidor la cuenta y el stock: así lo que se muestra es lo que de verdad quedó guardado, falle lo que falle.
  const syncFromServer = async (orderId: string) => {
    try {
      const [order, list] = await Promise.all([api.get(`/orders/${orderId}`), api.get(`/products/${restaurantId}`)])
      setActiveOrder(prev => (prev && prev.id === orderId ? order.data : prev))
      setProducts(list.data)
    } catch {
      // sin red se queda lo que ya se ve; la próxima vez que se abra la mesa se carga completo
    }
  }

  const addProduct = async (product: Product) => {
    if (!activeOrder || !selectedTable) return
    const quantity = getQty(product.id)
    if (product.stock < quantity) {
      toast.error(product.stock === 0 ? `${product.name} está agotado.` : `Solo quedan ${product.stock} de ${product.name}.`)
      return
    }

    const orderId = activeOrder.id
    const tableId = selectedTable.id
    const existingItem = activeOrder.items?.find((i: OrderItem) => i.product.id === product.id)

    const optimisticItems = existingItem
      ? activeOrder.items.map((i: OrderItem) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + quantity } : i
        )
      : [
          ...(activeOrder.items ?? []),
          {
            id: `temp-${product.id}`,
            orderId: activeOrder.id,
            productId: product.id,
            quantity,
            unitPrice: product.price,
            product,
          } as unknown as OrderItem,
        ]
    const optimisticTotal = optimisticItems.reduce((sum: number, i: OrderItem) => sum + i.unitPrice * i.quantity, 0)

    setActiveOrder({ ...activeOrder, items: optimisticItems, total: optimisticTotal })
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, stock: p.stock - quantity } : p))
    setQuantities(q => ({ ...q, [product.id]: 1 }))
    setTables(prev => prev && prev.map(t => t.id === tableId ? { ...t, status: "OCUPADA" } : t))
    setPending(n => n + 1)
    inFlight.current += 1

    try {
      await api.post(`/orders/${orderId}/items`, { productId: product.id, quantity })
    } catch (err) {
      toast.error(apiMessage(err, "No se pudo agregar el producto."))
    } finally {
      inFlight.current -= 1
      if (inFlight.current === 0) await syncFromServer(orderId)
      setPending(n => n - 1)
    }
  }

  const removeItem = async (itemId: string) => {
    if (!activeOrder) return
    try {
      await api.delete(`/orders/items/${itemId}`)
      const res = await api.get(`/orders/${activeOrder.id}`)
      setActiveOrder(res.data)
      fetchProducts()
    } catch (err) {
      toast.error(apiMessage(err, "No se pudo quitar el producto."))
    }
  }

  // "cuenta" para que el cliente la revise, "pago" al cobrar
  const receiptOps = (kind: ReceiptData["kind"], extra: Partial<ReceiptData> = {}) => {
    if (!activeOrder || !selectedTable) return null
    return buildReceipt({
      kind,
      restaurant: user?.restaurantName ?? "Restaurante",
      table: selectedTable.number,
      orderCode: activeOrder.id.slice(0, 8),
      waiter: user?.name,
      date: new Date(),
      items: (activeOrder.items ?? []).map(i => ({ name: i.product.name, quantity: i.quantity, unitPrice: i.unitPrice })),
      subtotal: activeOrder.total,
      footer: printer.settings.footer,
      tipPercent: settings.tipPercent,
      ...extra,
    })
  }

  const reportPrintError = (err: unknown) => {
    if (err instanceof PrinterError && err.code === "NOT_CONNECTED") {
      toast.info(err.message)
      window.dispatchEvent(new Event(OPEN_PRINTER_EVENT))
    } else {
      toast.error(err instanceof PrinterError ? err.message : "No se pudo imprimir.")
    }
  }

  const printBill = async () => {
    if (!activeOrder?.items?.length || pending > 0) return
    const ops = receiptOps("cuenta")
    if (!ops) return
    // sin USB en este navegador, diálogo de impresión
    if (!printer.supported) { printer.printInBrowser(ops); return }
    try {
      await printer.print(ops)
      toast.success("Cuenta enviada a la impresora.")
    } catch (err) {
      reportPrintError(err)
    }
  }

  const closeOrder = async () => {
    if (!activeOrder || !selectedTable || !paymentMethod || !paymentValid || submitting || pending > 0) return
    setSubmitting(true)
    // se arma antes de cerrar, con la comanda todavía abierta
    const withChange = cashDue > 0 && received >= cashDue
    const ticket = canPrint && printer.settings.autoPrint && printer.status === "ready"
      ? receiptOps("pago", {
          paymentMethod: paymentLabel,
          tip: tipAmount,
          ...(withChange ? { cashReceived: received, change } : {}),
        })
      : null
    try {
      await api.patch(`/orders/${activeOrder.id}/close`, {
        paymentMethod,
        tip: tipAmount,
        ...(isMixed ? { cashAmount: cashPaid, transferMethod } : {}),
      })
      toast.success(
        `Mesa ${selectedTable.number} cerrada · ${cop(activeOrder.total + tipAmount)}` +
        (withChange && change > 0 ? ` · Devuelta ${cop(change)}` : "")
      )
      resetComanda()
      if (ticket) printer.print(ticket).catch(reportPrintError)
      await fetchTables()
    } catch (err) {
      toast.error(apiMessage(err, "No se pudo cerrar la cuenta."))
    } finally {
      setSubmitting(false)
    }
  }

  const cancelActiveOrder = async () => {
    if (!activeOrder) return
    try {
      await api.patch(`/orders/${activeOrder.id}/cancel`)
      toast.success("Orden cancelada. Los productos volvieron al inventario.")
      resetComanda()
      fetchTables()
      fetchProducts()
    } catch (err) {
      toast.error(apiMessage(err, "No se pudo cancelar la orden."))
    }
  }

  const requestCloseModal = () => {
    if (submitting) return
    if (activeOrder?.items?.length) {
      setConfirm({
        title: "¿Cerrar sin cobrar?",
        message: "La mesa tiene productos. La cuenta queda abierta y puedes retomarla desde la mesa.",
        confirmLabel: "Cerrar panel",
        tone: "primary",
        onConfirm: () => { resetComanda(); fetchTables() },
      })
      return
    }
    // una orden vacía no sirve: se cancela para no dejar cuentas fantasma
    const orderId = activeOrder?.id
    resetComanda()
    if (orderId) {
      api.patch(`/orders/${orderId}/cancel`).catch(() => {}).finally(() => fetchTables())
    }
  }

  const requestCancelOrder = () => {
    setConfirm({
      title: "¿Cancelar la orden?",
      message: "Se borran los productos de la cuenta y vuelven al inventario. La mesa queda disponible.",
      confirmLabel: "Sí, cancelar orden",
      tone: "danger",
      onConfirm: cancelActiveOrder,
    })
  }

  const handleAddTable = async () => {
    if (!tables || creatingTable) return
    setCreatingTable(true)
    try {
      const nextNumber = tables.length > 0 ? Math.max(...tables.map(t => t.number)) + 1 : 1
      await api.post("/tables", { number: nextNumber, restaurantId })
      await fetchTables()
      toast.success(`Mesa ${nextNumber} creada.`)
    } catch (err) {
      toast.error(apiMessage(err, "No se pudo crear la mesa."))
    } finally {
      setCreatingTable(false)
    }
  }

  const requestDeleteTable = (table: Table) => {
    setConfirm({
      title: "Eliminar mesa",
      message: `¿Seguro que quieres eliminar la Mesa ${table.number}? Esta acción no se puede deshacer.`,
      confirmLabel: "Sí, eliminar",
      tone: "danger",
      onConfirm: async () => {
        try {
          await api.delete(`/tables/${table.id}`)
          setTables(prev => prev && prev.filter(t => t.id !== table.id))
          toast.success(`Mesa ${table.number} eliminada.`)
        } catch (err) {
          toast.error(apiMessage(err, "No se pudo eliminar la mesa."))
        }
      },
    })
  }

  const runConfirm = async () => {
    if (!confirm) return
    setConfirmBusy(true)
    try {
      await confirm.onConfirm()
    } finally {
      setConfirmBusy(false)
      setConfirm(null)
    }
  }

  const subtotal = activeOrder?.total ?? 0
  const itemCount = activeOrder?.items?.reduce((n, i) => n + i.quantity, 0) ?? 0
  const totalWithTip = subtotal + tipAmount
  // al cobrar, la propina sugerida del restaurante (10% si no la cambió) ya queda puesta; se puede quitar o cambiar
  const openPayment = () => {
    setTipAmount(tenPercent)
    setTipText("")
    setReceivedText("")
    setShowPayment(true)
  }
  const pickTip = (amount: number) => {
    setTipAmount(amount)
    setTipText("")
  }
  const isMixed = paymentMethod === "Mixto"
  const transferPart = Math.max(subtotal - cashPaid, 0)
  // lo que se paga en efectivo: todo (con propina) si es efectivo; en el mixto, solo la parte en efectivo
  const cashDue = paymentMethod === "Efectivo" ? totalWithTip : isMixed ? cashPaid : 0
  const received = Number(receivedText) || 0
  const change = received - cashDue
  // si se escribió con cuánto paga y no alcanza, no se deja cobrar
  const cashShort = cashDue > 0 && received > 0 && received < cashDue
  const cashOptions = quickCashAmounts(cashDue)
  // en el mixto el efectivo va entre 0 y el total, y hay que decir por dónde se pagó el resto
  const paymentValid = (!isMixed || (cashPaid > 0 && cashPaid < subtotal && transferMethod !== "")) && !cashShort
  const paymentLabel = isMixed
    ? `Efectivo ${cop(cashPaid)} + ${transferMethod || "transferencia"} ${cop(transferPart)}`
    : paymentMethod
  const tenPercent = suggestedTip(subtotal, settings.tipPercent)

  const categories = useMemo(() => {
    const names = new Set<string>()
    products.forEach(p => { if (p.category?.name) names.add(p.category.name) })
    return ["Todas", ...Array.from(names).sort((a, b) => a.localeCompare(b))]
  }, [products])

  const filteredProducts = useMemo(() => {
    const q = productSearch.toLowerCase().trim()
    return products.filter(p => {
      const matchCat = categoryFilter === "Todas" || p.category?.name === categoryFilter
      const matchText = !q || p.name.toLowerCase().includes(q) || (p.category?.name.toLowerCase().includes(q) ?? false)
      return matchCat && matchText
    })
  }, [products, productSearch, categoryFilter])

  const free = tables?.filter(t => t.status === "DISPONIBLE").length ?? 0
  const busy = tables?.filter(t => t.status === "OCUPADA").length ?? 0

  const visibleTables = (tables ?? []).filter(t => {
    const matchText = t.number.toString().includes(tableSearch.trim())
    const matchFilter = filter === "all" || (filter === "busy" ? t.status === "OCUPADA" : t.status === "DISPONIBLE")
    return matchText && matchFilter
  })

  const openOrderOf = (t: Table) => t.orders?.[0]
  const comandaOpenSince = selectedTable ? openOrderOf(selectedTable)?.createdAt : undefined

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar title="Mesas">
        {isAdmin && (
          <Button onClick={handleAddTable} loading={creatingTable} disabled={!tables}>
            <Plus size={17} /> <span className="max-sm:hidden">Nueva mesa</span><span className="sm:hidden">Nueva</span>
          </Button>
        )}
      </TopBar>

      <div className="flex-1 overflow-y-auto px-4 pb-8 pt-2 md:px-7">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-soft">
            <span className="font-semibold text-ink tnum">{free}</span> disponibles ·{" "}
            <span className="font-semibold text-ink tnum">{busy}</span> ocupadas
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-lg bg-surface p-1" role="group" aria-label="Filtrar mesas">
              {([["all", "Todas"], ["free", "Disponibles"], ["busy", "Ocupadas"]] as const).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  aria-pressed={filter === value}
                  className={cn(
                    "h-9 rounded-md px-3 text-sm font-semibold transition-colors",
                    filter === value ? "bg-brand text-brand-ink" : "text-soft hover:text-ink"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="relative w-36 sm:w-44">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={16} />
              <Input
                type="search"
                inputMode="numeric"
                value={tableSearch}
                onChange={e => setTableSearch(e.target.value)}
                placeholder="Nº de mesa"
                aria-label="Buscar mesa por número"
                className="h-10 pl-9"
              />
            </div>
          </div>
        </div>

        {tables === null ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5" aria-busy="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-[7.5rem] animate-pulse rounded-lg bg-surface" />
            ))}
          </div>
        ) : tables.length === 0 ? (
          <div className="rounded-xl bg-surface px-6 py-12 text-center">
            <p className="font-display text-lg font-bold">Todavía no hay mesas</p>
            <p className="mt-1 text-soft">
              {isAdmin ? "Crea la primera con el botón «Nueva mesa»." : "Pídele al administrador que cree las mesas."}
            </p>
          </div>
        ) : visibleTables.length === 0 ? (
          <p className="py-10 text-center text-soft">Ninguna mesa coincide con la búsqueda.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {visibleTables.map(table => {
              const isBusy = table.status === "OCUPADA"
              const order = openOrderOf(table)
              const opening = openingId === table.id
              return (
                <div key={table.id} className="relative">
                  <button
                    onClick={() => openTable(table)}
                    disabled={openingId !== null}
                    aria-label={`Mesa ${table.number}, ${isBusy ? "ocupada" : "disponible"}`}
                    className={cn(
                      "flex min-h-[7.5rem] w-full flex-col gap-2 rounded-lg p-4 text-left transition-colors disabled:cursor-wait",
                      isBusy ? "bg-hot/20 hover:bg-hot/30" : "bg-surface hover:bg-surface-2"
                    )}
                  >
                    <span className="font-display text-3xl font-extrabold leading-none tnum">{table.number}</span>
                    <span className="flex items-center gap-2 text-[15px] font-semibold">
                      <span className={cn("size-2.5 rounded-full", isBusy ? "bg-hot" : "bg-good")} aria-hidden />
                      {isBusy ? "Ocupada" : "Disponible"}
                    </span>
                    <span className="text-sm text-soft tnum">
                      {isBusy && order ? `${cop(order.total)} · ${elapsed(order.createdAt, now)}` : isBusy ? "Con pedido" : "Sin orden"}
                    </span>
                    {opening && (
                      <Loader2 size={18} className="absolute bottom-3 right-3 animate-spin text-soft" aria-hidden />
                    )}
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => requestDeleteTable(table)}
                      aria-label={`Eliminar mesa ${table.number}`}
                      className="absolute right-1.5 top-1.5 grid size-9 place-items-center rounded-md text-faint transition-colors hover:bg-bad/15 hover:text-bad"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* comanda encima de las mesas */}
      <Modal
        open={modalOpen}
        onClose={requestCloseModal}
        title={selectedTable ? `Mesa ${selectedTable.number}` : "Mesa"}
        subtitle={
          activeOrder
            ? `Orden #${activeOrder.id.slice(0, 8)}${comandaOpenSince ? ` · abierta hace ${elapsed(comandaOpenSince, now)}` : ""}`
            : undefined
        }
        size="xl"
        tall
        fullOnMobile
        bodyClassName="overflow-hidden"
      >
        <div className="flex h-full min-h-0 flex-col md:grid md:grid-cols-[minmax(0,1fr)_23rem]">
          {/* pestañas, solo en celular */}
          <div className="flex gap-1 px-4 pb-3 md:hidden" role="tablist" aria-label="Secciones de la comanda">
            {([["products", "Productos"], ["account", `Cuenta (${itemCount})`]] as const).map(([value, label]) => (
              <button
                key={value}
                role="tab"
                aria-selected={pane === value}
                onClick={() => setPane(value)}
                className={cn(
                  "h-11 flex-1 rounded-md text-[15px] font-semibold transition-colors",
                  pane === value ? "bg-brand text-brand-ink" : "bg-surface-2 text-soft"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <section
            className={cn(
              "min-h-0 flex-col overflow-y-auto px-4 pb-4 md:flex md:px-6",
              pane === "products" ? "flex flex-1" : "hidden"
            )}
          >
            <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-2.5 bg-surface px-4 pb-3 md:-mx-6 md:px-6">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={16} />
                <Input
                  type="search"
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  placeholder="Buscar por nombre o categoría"
                  aria-label="Buscar producto"
                  className="pl-9"
                />
              </div>
              {categories.length > 2 && (
                <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:-mx-6 md:px-6" role="group" aria-label="Filtrar por categoría">
                  {categories.map(c => (
                    <button
                      key={c}
                      onClick={() => setCategoryFilter(c)}
                      aria-pressed={categoryFilter === c}
                      className={cn(
                        "h-9 shrink-0 rounded-md px-3 text-sm font-semibold transition-colors",
                        categoryFilter === c ? "bg-brand text-brand-ink" : "bg-surface-2 text-soft hover:text-ink"
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2.5 min-[440px]:grid-cols-2 2xl:grid-cols-3">
              {filteredProducts.map(product => {
                const out = product.stock <= 0
                const low = !out && product.stock <= product.minStock
                return (
                  <div key={product.id} className={cn("flex flex-col gap-2 rounded-lg bg-surface-2 p-3", out && "opacity-60")}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[13px] text-soft">{product.category?.name ?? "Sin categoría"}</span>
                      {out && <span className="text-[13px] font-semibold text-bad">Agotado</span>}
                      {low && <span className="text-[13px] font-semibold text-warn">Quedan {product.stock}</span>}
                    </div>
                    <p className="flex-1 font-semibold leading-snug">{product.name}</p>
                    <p className="font-display text-lg font-bold tnum">{cop(product.price)}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="flex items-center gap-1">
                      <button
                        onClick={() => changeQty(product.id, -1)}
                        aria-label={`Reducir cantidad de ${product.name}`}
                        className="grid size-10 shrink-0 place-items-center rounded-md bg-surface-3 hover:brightness-125"
                      >
                        <Minus size={15} />
                      </button>
                      <span className="w-6 text-center font-bold tnum">{getQty(product.id)}</span>
                      <button
                        onClick={() => changeQty(product.id, 1)}
                        aria-label={`Aumentar cantidad de ${product.name}`}
                        className="grid size-10 shrink-0 place-items-center rounded-md bg-surface-3 hover:brightness-125"
                      >
                        <Plus size={15} />
                      </button>
                      </div>
                      <Button
                        size="sm"
                        variant="primary"
                        className="h-10 min-w-[5.5rem] flex-1 px-2"
                        disabled={out}
                        onClick={() => addProduct(product)}
                        aria-label={`Agregar ${product.name} a la orden`}
                      >
                        Agregar
                      </Button>
                    </div>
                  </div>
                )
              })}
              {filteredProducts.length === 0 && (
                <p className="col-span-full py-8 text-center text-soft">Sin resultados.</p>
              )}
            </div>

            <div className="sticky bottom-0 -mx-4 mt-4 border-t border-line bg-surface px-4 py-3 md:hidden">
              <Button className="w-full" size="lg" onClick={() => setPane("account")}>
                Ver cuenta · {itemCount} {itemCount === 1 ? "producto" : "productos"} · {cop(subtotal)}
              </Button>
            </div>
          </section>

          <aside
            className={cn(
              "min-h-0 flex-col bg-canvas/40 md:flex md:border-l md:border-line",
              pane === "account" ? "flex flex-1" : "hidden"
            )}
          >
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5">
              <h3 className="mb-2 font-display text-base font-bold">Pedido actual</h3>
              {activeOrder?.items?.length ? (
                <ul>
                  {activeOrder.items.map((item: OrderItem) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{item.product.name}</p>
                        <p className="text-sm text-soft tnum">{item.quantity} × {cop(item.unitPrice)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="font-bold tnum">{cop(item.quantity * item.unitPrice)}</span>
                        <button
                          onClick={() => removeItem(item.id)}
                          disabled={item.id.startsWith("temp-")}
                          aria-label={`Quitar ${item.product.name} de la orden`}
                          className="grid size-10 place-items-center rounded-md text-faint transition-colors hover:bg-bad/15 hover:text-bad disabled:opacity-40"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-soft">Todavía no hay productos. Agrégalos desde la lista.</p>
              )}

              {showPayment && (
                <div className="mt-5 flex flex-col gap-4">
                  <div>
                    <h3 className="mb-2 font-display text-base font-bold">Método de pago</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {paymentMethods.map(method => (
                        <button
                          key={method}
                          onClick={() => setPaymentMethod(method)}
                          aria-pressed={paymentMethod === method}
                          className={cn(
                            "h-12 rounded-md text-[15px] font-semibold transition-colors",
                            paymentMethod === method ? "bg-brand text-brand-ink" : "bg-surface-2 text-soft hover:text-ink"
                          )}
                        >
                          {method}
                        </button>
                      ))}
                    </div>

                    {isMixed && (
                      <div className="mt-3 flex flex-col gap-3 rounded-lg bg-surface-2 p-3">
                        <label className="flex flex-col gap-1.5">
                          <span className="text-sm font-semibold">Pagó en efectivo</span>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={cashPaid === 0 ? "" : cashPaid}
                            onChange={e => setCashPaid(Math.max(0, Number(e.target.value)))}
                            placeholder="Valor en efectivo"
                          />
                        </label>
                        <div className="flex items-center justify-between text-[15px]">
                          <span className="text-soft">El resto, por transferencia</span>
                          <span className="font-bold tnum">{cop(transferPart)}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {transferMethods.map(method => (
                            <button
                              key={method}
                              onClick={() => setTransferMethod(method)}
                              aria-pressed={transferMethod === method}
                              className={cn(
                                "h-11 rounded-md text-sm font-semibold transition-colors",
                                transferMethod === method ? "bg-brand text-brand-ink" : "bg-surface text-soft hover:text-ink"
                              )}
                            >
                              {method}
                            </button>
                          ))}
                        </div>
                        {cashPaid >= subtotal && cashPaid > 0 && (
                          <p className="text-sm text-warn">El efectivo debe ser menor al total. Si pagó todo en efectivo, elige «Efectivo».</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="mb-2 font-display text-base font-bold">Propina</h3>
                    <div className="grid grid-cols-3 gap-2">
                      {tenPercent > 0 && (
                        <button
                          onClick={() => pickTip(tenPercent)}
                          aria-pressed={tipAmount === tenPercent}
                          className={cn(
                            "h-11 rounded-md text-sm font-semibold transition-colors",
                            tipAmount === tenPercent ? "bg-brand text-brand-ink" : "bg-surface-2 text-soft hover:text-ink"
                          )}
                        >
                          {settings.tipPercent}% · {cop(tenPercent)}
                        </button>
                      )}
                      {TIP_PRESETS.filter(amount => amount === 0 || amount !== tenPercent).map(amount => (
                        <button
                          key={amount}
                          onClick={() => pickTip(amount)}
                          aria-pressed={tipAmount === amount}
                          className={cn(
                            "h-11 rounded-md text-sm font-semibold transition-colors",
                            tipAmount === amount ? "bg-brand text-brand-ink" : "bg-surface-2 text-soft hover:text-ink"
                          )}
                        >
                          {amount === 0 ? "Sin propina" : cop(amount)}
                        </button>
                      ))}
                    </div>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={tipText}
                      onChange={e => {
                        setTipText(e.target.value)
                        setTipAmount(Math.max(0, Number(e.target.value)))
                      }}
                      placeholder="Otro valor"
                      aria-label="Valor de propina personalizado"
                      className="mt-2"
                    />
                    <p className="mt-1.5 text-sm text-faint">La propina es para el personal y no entra a los ingresos.</p>
                  </div>

                  {cashDue > 0 && (
                    <div className="flex flex-col gap-3 rounded-lg bg-surface-2 p-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="font-display text-base font-bold">¿Con cuánto paga?</h3>
                        <span className="text-sm text-soft tnum">
                          {isMixed ? "En efectivo" : "A pagar"} {cop(cashDue)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {cashOptions.map(value => (
                          <button
                            key={value}
                            onClick={() => setReceivedText(String(value))}
                            aria-pressed={received === value}
                            className={cn(
                              "h-11 rounded-md text-sm font-semibold tnum transition-colors",
                              received === value ? "bg-brand text-brand-ink" : "bg-surface text-soft hover:text-ink"
                            )}
                          >
                            {value === cashDue ? `Exacto · ${cop(value)}` : cop(value)}
                          </button>
                        ))}
                      </div>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={receivedText}
                        onChange={e => setReceivedText(e.target.value)}
                        placeholder="Otro valor"
                        aria-label="Con cuánto paga el cliente"
                      />
                      {received > 0 && (cashShort ? (
                        <p className="text-sm font-semibold text-warn">Faltan {cop(cashDue - received)}</p>
                      ) : (
                        <div className="flex items-baseline justify-between">
                          <span className="font-semibold">Devuelta</span>
                          <span className="font-display text-2xl font-extrabold tnum text-good">{cop(change)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2.5 border-t border-line px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-5">
              {showPayment ? (
                <div className="flex flex-col gap-1 text-[15px]">
                  <div className="flex justify-between"><span className="text-soft">Subtotal</span><span className="tnum">{cop(subtotal)}</span></div>
                  <div className="flex justify-between"><span className="text-soft">Propina</span><span className="tnum text-good">+ {cop(tipAmount)}</span></div>
                  <div className="flex items-baseline justify-between pt-1">
                    <span className="font-semibold">Total a cobrar</span>
                    <span className="font-display text-2xl font-extrabold tnum">{cop(totalWithTip)}</span>
                  </div>
                  {cashDue > 0 && received > 0 && !cashShort && (
                    <div className="flex justify-between"><span className="text-soft">Devuelta</span><span className="font-semibold tnum text-good">{cop(change)}</span></div>
                  )}
                </div>
              ) : (
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold text-soft">Total</span>
                  <span className="font-display text-2xl font-extrabold tnum">{cop(subtotal)}</span>
                </div>
              )}

              {!showPayment ? (
                <>
                  <Button size="lg" disabled={!activeOrder?.items?.length || pending > 0} onClick={openPayment}>
                    <CheckCircle2 size={19} /> Cerrar cuenta
                  </Button>
                  {canPrint && (
                    <Button variant="secondary" disabled={!activeOrder?.items?.length || pending > 0} onClick={printBill}>
                      <Printer size={17} /> Imprimir cuenta
                    </Button>
                  )}
                  <Button variant="secondary" className="md:hidden" onClick={() => setPane("products")}>
                    Seguir agregando
                  </Button>
                  {!!activeOrder?.items?.length && (
                    <Button variant="ghost" size="sm" className="text-bad hover:text-bad" onClick={requestCancelOrder}>
                      Cancelar orden
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Button
                    size="lg"
                    variant="success"
                    loading={submitting}
                    disabled={!paymentMethod || !paymentValid || pending > 0}
                    onClick={closeOrder}
                  >
                    <CheckCircle2 size={19} /> Confirmar {cop(totalWithTip)}
                  </Button>
                  <Button variant="secondary" onClick={() => setShowPayment(false)} disabled={submitting}>
                    Volver
                  </Button>
                </>
              )}
            </div>
          </aside>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ""}
        message={confirm?.message ?? ""}
        confirmLabel={confirm?.confirmLabel}
        tone={confirm?.tone}
        loading={confirmBusy}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
