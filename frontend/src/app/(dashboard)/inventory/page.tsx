"use client"

import { useEffect, useMemo, useState } from "react"
import { Package, Pencil, Plus, Search, Tag, Trash2, TriangleAlert } from "lucide-react"

import api from "@/lib/axios"
import { useCurrentUser } from "@/lib/auth"
import { apiMessage } from "@/lib/errors"
import { cop } from "@/lib/format"
import { cn } from "@/lib/utils"
import TopBar from "@/components/ui/layout/TopBar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Field, Input, Select } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import { useToast } from "@/components/ui/toast"

type Category = { id: string; name: string }

type Product = {
  id: string
  name: string
  price: number
  unit: string
  stock: number
  minStock: number
  categoryId: string
  category: { id: string; name: string }
}

type ProductForm = {
  name: string
  price: string
  unit: string
  stock: string
  minStock: string
  categoryId: string
}

type StockStatus = "ok" | "low" | "empty"

const UNITS = ["porciones", "unidades", "kg", "litros", "gramos", "ml"]

const FORM_INIT: ProductForm = {
  name: "", price: "", unit: "unidades", stock: "", minStock: "5", categoryId: "",
}

const STATUS_BADGE: Record<StockStatus, { tone: "good" | "warn" | "bad"; label: string }> = {
  ok:    { tone: "good", label: "En orden" },
  low:   { tone: "warn", label: "Stock bajo" },
  empty: { tone: "bad",  label: "Agotado" },
}

const statusOf = (p: Product): StockStatus =>
  p.stock === 0 ? "empty" : p.stock <= p.minStock ? "low" : "ok"

const stockColor = (s: StockStatus) => (s === "empty" ? "text-bad" : s === "low" ? "text-warn" : "text-good")

export default function InventoryPage() {
  const toast = useToast()
  const { token, restaurantId } = useCurrentUser()

  const [products, setProducts] = useState<Product[] | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState("")
  const [catFilter, setCatFilter] = useState("Todas")

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductForm>(FORM_INIT)
  const [saving, setSaving] = useState(false)

  const [catOpen, setCatOpen] = useState(false)
  const [newCatName, setNewCatName] = useState("")
  const [savingCat, setSavingCat] = useState(false)

  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null)
  const [deleteCategory, setDeleteCategory] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!restaurantId || !token) return
    api.get(`/products/${restaurantId}`)
      .then(r => setProducts(r.data))
      .catch(err => { setProducts([]); toast.error(apiMessage(err, "No se pudo cargar el inventario.")) })
    api.get(`/categories/${restaurantId}`)
      .then(r => setCategories(r.data))
      .catch(() => {})
  }, [restaurantId, token, toast])

  const list = useMemo(() => products ?? [], [products])
  const emptyStock = list.filter(p => p.stock === 0)
  const lowStock = list.filter(p => p.stock > 0 && p.stock <= p.minStock)
  const alertCount = emptyStock.length + lowStock.length

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return list.filter(p =>
      (catFilter === "Todas" || p.category?.name === catFilter) && (!q || p.name.toLowerCase().includes(q))
    )
  }, [list, search, catFilter])

  const openNew = () => {
    setEditing(null)
    setForm({ ...FORM_INIT, categoryId: categories[0]?.id ?? "" })
    setFormOpen(true)
  }

  const openEdit = (p: Product) => {
    setEditing(p)
    setForm({
      name: p.name, price: String(p.price), unit: p.unit,
      stock: String(p.stock), minStock: String(p.minStock), categoryId: p.categoryId,
    })
    setFormOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const body = {
      name: form.name, price: Number(form.price), unit: form.unit,
      stock: Number(form.stock), minStock: Number(form.minStock),
      categoryId: form.categoryId, restaurantId,
    }
    try {
      if (editing) {
        const res = await api.put(`/products/${editing.id}`, body)
        setProducts(prev => (prev ?? []).map(p => p.id === editing.id ? res.data : p))
        toast.success("Producto actualizado.")
      } else {
        const res = await api.post("/products", body)
        setProducts(prev => [...(prev ?? []), res.data])
        toast.success("Producto creado.")
      }
      setFormOpen(false)
    } catch (err) {
      toast.error(apiMessage(err, "No se pudo guardar el producto."))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteProduct = async () => {
    if (!deleteProduct) return
    setDeleting(true)
    try {
      await api.delete(`/products/${deleteProduct.id}`)
      setProducts(prev => (prev ?? []).filter(p => p.id !== deleteProduct.id))
      toast.success("Producto eliminado.")
    } catch (err) {
      toast.error(apiMessage(err, "No se pudo eliminar el producto. Puede estar en órdenes anteriores."))
    } finally {
      setDeleting(false)
      setDeleteProduct(null)
    }
  }

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCatName.trim()) return
    setSavingCat(true)
    try {
      const res = await api.post("/categories", { name: newCatName.trim(), restaurantId })
      setCategories(prev => [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)))
      setNewCatName("")
      toast.success("Categoría creada.")
    } catch (err) {
      toast.error(apiMessage(err, "No se pudo crear la categoría."))
    } finally {
      setSavingCat(false)
    }
  }

  const requestDeleteCategory = (c: Category) => {
    if (list.some(p => p.categoryId === c.id)) {
      toast.error(`No puedes eliminar "${c.name}" porque tiene productos asignados.`)
      return
    }
    setDeleteCategory(c)
  }

  const handleDeleteCategory = async () => {
    if (!deleteCategory) return
    setDeleting(true)
    try {
      await api.delete(`/categories/${deleteCategory.id}`)
      setCategories(prev => prev.filter(c => c.id !== deleteCategory.id))
      if (catFilter === deleteCategory.name) setCatFilter("Todas")
      toast.success("Categoría eliminada.")
    } catch (err) {
      toast.error(apiMessage(err, "No se pudo eliminar la categoría."))
    } finally {
      setDeleting(false)
      setDeleteCategory(null)
    }
  }

  const iconBtn = "grid size-10 place-items-center rounded-md text-faint transition-colors"

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar title="Inventario">
        <Button variant="secondary" onClick={() => setCatOpen(true)} aria-label="Categorías">
          <Tag size={17} /> <span className="max-sm:hidden">Categorías</span>
        </Button>
        <Button onClick={openNew}>
          <Plus size={17} /> <span className="max-sm:hidden">Nuevo producto</span><span className="sm:hidden">Nuevo</span>
        </Button>
      </TopBar>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-10 pt-2 md:px-7">
        <p className="text-soft">
          <span className="font-semibold text-ink tnum">{list.length}</span> productos registrados
        </p>

        {alertCount > 0 && (
          <div role="status" className="flex items-start gap-3 rounded-lg bg-bad/10 px-4 py-3.5">
            <TriangleAlert size={19} className="mt-0.5 shrink-0 text-bad" aria-hidden />
            <div className="min-w-0">
              <p className="font-semibold text-bad">
                {alertCount} {alertCount === 1 ? "producto con stock bajo o agotado" : "productos con stock bajo o agotado"}
              </p>
              <p className="mt-0.5 text-sm text-soft">
                {[...emptyStock, ...lowStock].map(p => `${p.name} (${p.stock} ${p.unit})`).join(" · ")}
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={16} />
            <Input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar producto"
              aria-label="Buscar producto"
              className="pl-9"
            />
          </div>
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filtrar por categoría">
            {["Todas", ...categories.map(c => c.name)].map(c => (
              <button
                key={c}
                onClick={() => setCatFilter(c)}
                aria-pressed={catFilter === c}
                className={cn(
                  "h-10 shrink-0 rounded-md px-3.5 text-sm font-semibold transition-colors",
                  catFilter === c ? "bg-brand text-brand-ink" : "bg-surface text-soft hover:text-ink"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {products === null ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-surface" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg bg-surface px-6 py-12 text-center text-soft">
            {list.length === 0 ? "Todavía no hay productos. Crea el primero con «Nuevo producto»." : "No hay productos que coincidan."}
          </div>
        ) : (
          <>
            {/* tablet y escritorio */}
            <div className="hidden overflow-x-auto rounded-lg bg-surface md:block">
              <table className="w-full border-collapse text-[15px]">
                <thead>
                  <tr className="text-left text-sm text-soft">
                    <th className="px-4 py-3 font-semibold">Producto</th>
                    <th className="px-4 py-3 font-semibold">Categoría</th>
                    <th className="px-4 py-3 text-right font-semibold">Precio</th>
                    <th className="px-4 py-3 font-semibold">Stock</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                    <th className="w-24" aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
                    const status = statusOf(p)
                    return (
                      <tr key={p.id} className="border-t border-line transition-colors hover:bg-surface-2/50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-2 text-brand"><Package size={16} /></span>
                            <span className="font-semibold">{p.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-soft">{p.category?.name ?? "–"}</td>
                        <td className="px-4 py-3 text-right font-semibold tnum">{cop(p.price)}</td>
                        <td className="px-4 py-3 tnum">
                          <span className={cn("font-display text-lg font-bold", stockColor(status))}>{p.stock}</span>
                          <span className="text-sm text-soft"> {p.unit} · mín {p.minStock}</span>
                        </td>
                        <td className="px-4 py-3"><Badge tone={STATUS_BADGE[status].tone}>{STATUS_BADGE[status].label}</Badge></td>
                        <td className="px-2 py-1">
                          <div className="flex justify-end">
                            <button onClick={() => openEdit(p)} aria-label={`Editar ${p.name}`} className={cn(iconBtn, "hover:bg-brand/15 hover:text-brand")}>
                              <Pencil size={16} />
                            </button>
                            <button onClick={() => setDeleteProduct(p)} aria-label={`Eliminar ${p.name}`} className={cn(iconBtn, "hover:bg-bad/15 hover:text-bad")}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* celular */}
            <ul className="flex flex-col gap-2 md:hidden">
              {filtered.map(p => {
                const status = statusOf(p)
                return (
                  <li key={p.id} className="rounded-lg bg-surface p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold leading-snug">{p.name}</p>
                        <p className="text-sm text-soft">{p.category?.name ?? "Sin categoría"} · {cop(p.price)}</p>
                      </div>
                      <Badge tone={STATUS_BADGE[status].tone}>{STATUS_BADGE[status].label}</Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <p className="tnum">
                        <span className={cn("font-display text-xl font-bold", stockColor(status))}>{p.stock}</span>
                        <span className="text-sm text-soft"> {p.unit} · mín {p.minStock}</span>
                      </p>
                      <div className="flex">
                        <button onClick={() => openEdit(p)} aria-label={`Editar ${p.name}`} className={cn(iconBtn, "hover:bg-brand/15 hover:text-brand")}>
                          <Pencil size={17} />
                        </button>
                        <button onClick={() => setDeleteProduct(p)} aria-label={`Eliminar ${p.name}`} className={cn(iconBtn, "hover:bg-bad/15 hover:text-bad")}>
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>

      <Modal open={formOpen} onClose={() => !saving && setFormOpen(false)} title={editing ? "Editar producto" : "Nuevo producto"} dismissible={!saving}>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 px-5 pb-5 sm:px-6 sm:pb-6">
          <Field label="Nombre" className="col-span-2">
            <Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ej. Pollo a la plancha" />
          </Field>
          <Field label="Precio">
            <Input type="number" inputMode="numeric" min="0" required value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="0" />
          </Field>
          <Field label="Stock actual">
            <Input type="number" inputMode="numeric" min="0" step="1" required value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} placeholder="0" />
          </Field>
          <Field label="Stock mínimo" hint="Avisa cuando baje de este número">
            <Input type="number" inputMode="numeric" min="0" step="1" required value={form.minStock} onChange={e => setForm({ ...form, minStock: e.target.value })} placeholder="5" />
          </Field>
          <Field label="Unidad">
            <Select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </Select>
          </Field>
          <Field label="Categoría" className="col-span-2">
            <Select required value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })}>
              <option value="">Seleccionar...</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <div className="col-span-2 flex gap-2.5 pt-1">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setFormOpen(false)} disabled={saving}>Cancelar</Button>
            <Button type="submit" className="flex-1" loading={saving}>
              {saving ? "Guardando..." : editing ? "Guardar cambios" : "Crear producto"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={catOpen} onClose={() => setCatOpen(false)} title="Categorías" size="sm">
        <div className="flex flex-col gap-4 px-5 pb-5 sm:px-6 sm:pb-6">
          <form onSubmit={handleCreateCategory} className="flex gap-2">
            <Input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Nueva categoría (ej. Postres)" aria-label="Nombre de la nueva categoría" required />
            <Button type="submit" loading={savingCat} aria-label="Agregar categoría" className="px-3.5"><Plus size={18} /></Button>
          </form>
          <ul className="rounded-lg bg-canvas/60">
            {categories.length === 0 && <li className="py-6 text-center text-soft">No hay categorías creadas.</li>}
            {categories.map(c => {
              const count = list.filter(p => p.categoryId === c.id).length
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 first:border-0">
                  <div className="min-w-0">
                    <span className="font-semibold">{c.name}</span>
                    <span className="ml-2 text-sm text-soft">{count} {count === 1 ? "producto" : "productos"}</span>
                  </div>
                  <button onClick={() => requestDeleteCategory(c)} aria-label={`Eliminar categoría ${c.name}`} className={cn(iconBtn, "hover:bg-bad/15 hover:text-bad")}>
                    <Trash2 size={16} />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteProduct !== null}
        title="¿Eliminar producto?"
        message={deleteProduct ? <>Vas a eliminar <strong className="text-ink">{deleteProduct.name}</strong>. Esta acción no se puede deshacer.</> : ""}
        confirmLabel="Sí, eliminar"
        loading={deleting}
        onConfirm={handleDeleteProduct}
        onCancel={() => setDeleteProduct(null)}
      />
      <ConfirmDialog
        open={deleteCategory !== null}
        title="¿Eliminar categoría?"
        message={deleteCategory ? <>Vas a eliminar la categoría <strong className="text-ink">{deleteCategory.name}</strong>.</> : ""}
        confirmLabel="Sí, eliminar"
        loading={deleting}
        onConfirm={handleDeleteCategory}
        onCancel={() => setDeleteCategory(null)}
      />
    </div>
  )
}
