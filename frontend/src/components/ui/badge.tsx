import { cn } from "@/lib/utils"

const TONES = {
  good:  "bg-good/15 text-good",
  warn:  "bg-warn/15 text-warn",
  bad:   "bg-bad/15 text-bad",
  brand: "bg-brand/15 text-brand",
  hot:   "bg-hot/20 text-hot",
  soft:  "bg-surface-3 text-soft",
} as const

export function Badge({
  tone = "soft", className, children,
}: { tone?: keyof typeof TONES; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded px-2 py-0.5 text-[13px] font-semibold whitespace-nowrap", TONES[tone], className)}>
      {children}
    </span>
  )
}
