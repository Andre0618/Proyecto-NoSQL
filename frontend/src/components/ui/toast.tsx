"use client"

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react"

type Tone = "success" | "error" | "info"
type ToastItem = { id: number; tone: Tone; message: string }

type ToastApi = {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info }
const COLORS = { success: "text-good", error: "text-bad", info: "text-brand" }

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setItems(prev => prev.filter(t => t.id !== id))
  }, [])

  const push = useCallback((tone: Tone, message: string) => {
    const id = nextId.current++
    setItems(prev => [...prev.slice(-2), { id, tone, message }])
    window.setTimeout(() => dismiss(id), tone === "error" ? 6500 : 3800)
  }, [dismiss])

  const api = useMemo<ToastApi>(() => ({
    success: m => push("success", m),
    error:   m => push("error", m),
    info:    m => push("info", m),
  }), [push])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed left-1/2 z-[200] flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col gap-2 bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-6"
      >
        {items.map(t => {
          const Icon = ICONS[t.tone]
          return (
            <div
              key={t.id}
              role={t.tone === "error" ? "alert" : "status"}
              className="fade-up pointer-events-auto flex items-start gap-3 rounded-lg bg-surface-3 px-4 py-3 text-[15px] shadow-xl ring-1 ring-white/10"
            >
              <Icon size={19} className={`mt-0.5 shrink-0 ${COLORS[t.tone]}`} aria-hidden />
              <p className="min-w-0 flex-1 leading-snug">{t.message}</p>
              <button onClick={() => dismiss(t.id)} aria-label="Cerrar aviso" className="-mr-1 shrink-0 text-soft hover:text-ink">
                <X size={16} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast debe usarse dentro de ToastProvider")
  return ctx
}
