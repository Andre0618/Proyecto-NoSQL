const TZ = "America/Bogota"

export const cop = (n: number | null | undefined): string =>
  `$${(n ?? 0).toLocaleString("es-CO")}`

export const copMinus = (n: number): string => `− ${cop(n)}`

// AAAA-MM-DD en hora de Colombia, para comparar "hoy" sin depender del navegador
export const dayKey = (d: Date | string): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(typeof d === "string" ? new Date(d) : d)

export const isToday = (d: Date | string): boolean => dayKey(d) === dayKey(new Date())

export const timeOfDay = (d: Date | string): string =>
  new Date(d).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: TZ })

export const shortDate = (d: Date | string): string =>
  new Date(d).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ })

export const longDate = (d: Date = new Date()): string =>
  d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: TZ })

export const elapsed = (from: Date | string, now: number = Date.now()): string => {
  const mins = Math.max(0, Math.floor((now - new Date(from).getTime()) / 60000))
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, "0")} min`
}
