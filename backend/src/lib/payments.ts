export type PaymentBuckets = { efectivo: number; nequi: number; bancolombia: number }

export type PaidOrder = {
  total: number
  paymentMethod: string | null
  cashAmount: number | null
  transferMethod: string | null
}

// Reparte lo que pagó una orden entre efectivo, Nequi y Bancolombia. En un pago mixto, lo que no fue
// en efectivo fue transferencia por el medio que se haya elegido. La propina no entra: va aparte.
export const splitPayment = (order: PaidOrder): PaymentBuckets => {
  const out: PaymentBuckets = { efectivo: 0, nequi: 0, bancolombia: 0 }

  const put = (method: string | null, amount: number) => {
    if (method === "Efectivo") out.efectivo += amount
    else if (method === "Nequi") out.nequi += amount
    // "Datafono" era el nombre anterior de Bancolombia; las órdenes viejas lo conservan
    else if (method === "Bancolombia" || method === "Datafono") out.bancolombia += amount
  }

  if (order.paymentMethod === "Mixto") {
    const cash = order.cashAmount ?? 0
    put("Efectivo", cash)
    put(order.transferMethod, order.total - cash)
  } else {
    put(order.paymentMethod, order.total)
  }
  return out
}

export const sumPayments = (orders: PaidOrder[]): PaymentBuckets =>
  orders.reduce((acc, o) => {
    const p = splitPayment(o)
    return { efectivo: acc.efectivo + p.efectivo, nequi: acc.nequi + p.nequi, bancolombia: acc.bancolombia + p.bancolombia }
  }, { efectivo: 0, nequi: 0, bancolombia: 0 })
