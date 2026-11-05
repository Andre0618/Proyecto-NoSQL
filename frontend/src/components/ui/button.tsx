import * as React from "react"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

const VARIANTS = {
  primary:   "bg-brand text-brand-ink hover:brightness-110",
  hot:       "bg-hot text-hot-ink hover:brightness-110",
  secondary: "bg-surface-2 text-ink hover:bg-surface-3",
  ghost:     "text-soft hover:bg-surface-2 hover:text-ink",
  danger:    "bg-bad/15 text-bad hover:bg-bad/25",
  success:   "bg-good/20 text-good hover:bg-good/30",
} as const

const SIZES = {
  sm:   "h-9 px-3 text-sm gap-1.5",
  md:   "h-11 px-4 text-[15px] gap-2",
  lg:   "h-12 px-5 text-base gap-2",
  icon: "h-10 w-10",
} as const

type ButtonProps = React.ComponentProps<"button"> & {
  variant?: keyof typeof VARIANTS
  size?: keyof typeof SIZES
  loading?: boolean
}

function Button({
  className, variant = "primary", size = "md", loading = false, disabled, children, type = "button", ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md font-semibold whitespace-nowrap select-none transition-[filter,background-color,color] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant], SIZES[size], className
      )}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

export { Button }
