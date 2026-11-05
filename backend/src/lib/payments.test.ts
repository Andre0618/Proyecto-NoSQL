import { test } from "node:test"
import assert from "node:assert/strict"

import { splitPayment, sumPayments } from "./payments"

const order = (paymentMethod: string | null, total: number, cashAmount: number | null = null, transferMethod: string | null = null) =>
  ({ total, paymentMethod, cashAmount, transferMethod })

test("un solo medio de pago lleva todo a su columna", () => {
  assert.deepEqual(splitPayment(order("Efectivo", 50000)), { efectivo: 50000, nequi: 0, bancolombia: 0 })
  assert.deepEqual(splitPayment(order("Nequi", 30000)), { efectivo: 0, nequi: 30000, bancolombia: 0 })
  assert.deepEqual(splitPayment(order("Bancolombia", 20000)), { efectivo: 0, nequi: 0, bancolombia: 20000 })
})

test("Datafono, el nombre viejo, cuenta como Bancolombia", () => {
  assert.deepEqual(splitPayment(order("Datafono", 12000)), { efectivo: 0, nequi: 0, bancolombia: 12000 })
})

test("pago mixto: el efectivo aparte y el resto por el medio de transferencia", () => {
  assert.deepEqual(splitPayment(order("Mixto", 100000, 40000, "Nequi")), { efectivo: 40000, nequi: 60000, bancolombia: 0 })
  assert.deepEqual(splitPayment(order("Mixto", 100000, 70000, "Bancolombia")), { efectivo: 70000, nequi: 0, bancolombia: 30000 })
})

test("las partes siempre suman el total de la orden", () => {
  const cases = [order("Efectivo", 76000), order("Mixto", 76000, 26000, "Nequi"), order("Datafono", 4000)]
  for (const c of cases) {
    const p = splitPayment(c)
    assert.equal(p.efectivo + p.nequi + p.bancolombia, c.total)
  }
})

test("sumPayments junta varias órdenes", () => {
  const total = sumPayments([order("Efectivo", 10000), order("Mixto", 20000, 5000, "Nequi"), order("Bancolombia", 7000)])
  assert.deepEqual(total, { efectivo: 15000, nequi: 15000, bancolombia: 7000 })
})
