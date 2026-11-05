"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Bell, CheckCircle2, TriangleAlert } from "lucide-react"

import api from "@/lib/axios"
import { authHeaders } from "@/lib/auth"
import { cn } from "@/lib/utils"

type StockProduct = { id: string; name: string; stock: number; minStock: number; unit: string }

export default function StockBell({ restaurantId }: { restaurantId: string }) {
  const [products, setProducts] = useState<StockProduct[]>([])
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    if (!restaurantId) return
    api.get(`/products/${restaurantId}`, { headers: authHeaders() })
      .then(r => setProducts(r.data))
      .catch(() => { /* el aviso es opcional */ })
  }, [restaurantId])

  useEffect(() => {
    load()
    const id = window.setInterval(load, 120_000)
    return () => window.clearInterval(id)
  }, [load])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const empty = products.filter(p => p.stock === 0)
  const low = products.filter(p => p.stock > 0 && p.stock <= p.minStock)
  const count = empty.length + low.length

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => { setOpen(o => !o); if (!open) load() }}
        aria-label={count > 0 ? `${count} avisos de inventario` : "Avisos de inventario"}
        aria-expanded={open}
        className="relative grid size-10 place-items-center rounded-md bg-surface text-soft transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <Bell size={18} />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 grid min-w-[18px] place-items-center rounded-full bg-hot px-1 text-[11px] font-bold leading-[18px] text-hot-ink">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="scale-in absolute right-0 top-12 z-50 w-[min(20rem,calc(100vw-2rem))] rounded-lg bg-surface-2 p-2 shadow-2xl ring-1 ring-white/10">
          <p className="px-3 pb-1 pt-2 font-display text-[15px] font-bold">Inventario</p>
          {count === 0 ? (
            <div className="flex items-center gap-2.5 px-3 py-3 text-sm text-soft">
              <CheckCircle2 size={17} className="text-good" /> Todo el inventario está en orden.
            </div>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {[...empty, ...low].map(p => (
                <li key={p.id} className="flex items-start gap-2.5 rounded-md px-3 py-2">
                  <TriangleAlert size={16} className={cn("mt-0.5 shrink-0", p.stock === 0 ? "text-bad" : "text-warn")} />
                  <div className="min-w-0 text-sm">
                    <p className="truncate font-semibold">{p.name}</p>
                    <p className="text-soft">
                      {p.stock === 0 ? "Agotado" : `Quedan ${p.stock} ${p.unit}`} · mínimo {p.minStock}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
