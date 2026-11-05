"use client"

import { useEffect, useId, useRef } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const SIZES = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-5xl",
} as const

const FOCUSABLE =
  "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"

// para bloquear el scroll de fondo una sola vez
let openCount = 0
// ventanas abiertas en orden: solo la de encima atiende el teclado
let stack: number[] = []
let nextId = 1

type ModalProps = {
  open: boolean
  onClose: () => void
  title?: string
  subtitle?: string
  size?: keyof typeof SIZES
  /** pantalla completa en celular (la comanda); si no, sube desde abajo como una hoja */
  fullOnMobile?: boolean
  /** alto fijo en pantallas grandes, para dos columnas con scroll propio */
  tall?: boolean
  /** false: ni Escape ni el fondo la cierran (mientras se guarda, por ejemplo) */
  dismissible?: boolean
  footer?: React.ReactNode
  bodyClassName?: string
  children: React.ReactNode
}

export function Modal({
  open, onClose, title, subtitle, size = "md", fullOnMobile = false, tall = false,
  dismissible = true, footer, bodyClassName, children,
}: ModalProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const dismissibleRef = useRef(dismissible)
  useEffect(() => {
    onCloseRef.current = onClose
    dismissibleRef.current = dismissible
  })

  useEffect(() => {
    if (!open) return
    const myId = nextId++
    stack.push(myId)
    const previouslyFocused = document.activeElement as HTMLElement | null
    openCount += 1
    document.body.style.overflow = "hidden"
    dialogRef.current?.focus()

    // el teclado va a nivel de documento: si el foco se pierde (un botón que se desactiva), Escape y Tab siguen sirviendo
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== myId) return
      if (e.key === "Escape") {
        if (dismissibleRef.current) {
          e.stopPropagation()
          onCloseRef.current()
        }
        return
      }
      if (e.key !== "Tab") return
      const dialog = dialogRef.current
      if (!dialog) return
      const nodes = dialog.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (nodes.length === 0) { e.preventDefault(); dialog.focus(); return }
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      const active = document.activeElement
      if (!dialog.contains(active)) { e.preventDefault(); first.focus(); return }
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener("keydown", onKey)

    return () => {
      document.removeEventListener("keydown", onKey)
      stack = stack.filter(id => id !== myId)
      openCount -= 1
      if (openCount === 0) document.body.style.overflow = ""
      previouslyFocused?.focus?.()
    }
  }, [open])

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-6">
      {/* fondo borroso */}
      <div
        className="fade-in absolute inset-0 bg-black/50 backdrop-blur-md"
        onMouseDown={dismissible ? () => onCloseRef.current() : undefined}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          "relative flex w-full flex-col overflow-hidden bg-surface text-ink shadow-2xl outline-none",
          "sheet-up sm:rounded-xl",
          fullOnMobile ? "h-dvh rounded-none sm:h-auto" : "max-h-[92dvh] rounded-t-xl",
          tall ? "sm:h-[min(46rem,90dvh)]" : "sm:max-h-[90dvh]",
          SIZES[size]
        )}
      >
        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 sm:px-6">
            <div className="min-w-0">
              {title && <h2 id={titleId} className="font-display text-xl font-bold leading-tight">{title}</h2>}
              {subtitle && <p className="mt-0.5 text-sm text-soft">{subtitle}</p>}
            </div>
            {dismissible && (
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="-mr-2 grid size-10 shrink-0 place-items-center rounded-md text-soft transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <X size={20} />
              </button>
            )}
          </div>
        )}
        <div className={cn("min-h-0 flex-1 overflow-y-auto", bodyClassName)}>{children}</div>
        {footer && (
          <div className="border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">{footer}</div>
        )}
      </div>
    </div>,
    document.body
  )
}
