// Billetes con los que suele pagar el cliente: el valor exacto y los redondeos hacia arriba a 10, 20, 50 y 100 mil.
// 84.000 -> exacto, 90.000, 100.000. Sirve para marcar «con cuánto paga» con un toque.
const ROUND_UPS = [10_000, 20_000, 50_000, 100_000]

export const quickCashAmounts = (due: number, max = 4): number[] => {
  if (!(due > 0)) return []
  const options = [due, ...ROUND_UPS.map(bill => Math.ceil(due / bill) * bill)]
  return Array.from(new Set(options)).filter(v => v >= due).sort((a, b) => a - b).slice(0, max)
}
