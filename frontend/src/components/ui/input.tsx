import * as React from "react"

import { cn } from "@/lib/utils"

// 16px para que el celular no haga zoom al escribir
export const fieldClass =
  "h-11 w-full min-w-0 rounded-md border border-white/15 bg-canvas px-3 text-base text-ink placeholder:text-faint transition-colors focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-bad"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <input type={type} className={cn(fieldClass, className)} {...props} />
}

function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select className={cn(fieldClass, "pr-8", className)} {...props}>
      {children}
    </select>
  )
}

// la etiqueta envuelve al campo: queda asociada sin necesidad de ids
function Field({
  label, hint, error, className, children,
}: { label: string; hint?: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-sm font-semibold text-soft">{label}</span>
      {children}
      {error ? (
        <span className="text-sm text-bad">{error}</span>
      ) : hint ? (
        <span className="text-sm text-faint">{hint}</span>
      ) : null}
    </label>
  )
}

export { Input, Select, Field }
