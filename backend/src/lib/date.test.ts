import { test } from "node:test"
import assert from "node:assert/strict"

import { colombiaDayStart, getColombiaDayRange } from "./date"

// Colombia es UTC-5 todo el año: su medianoche es a las 05:00 UTC
test("el día colombiano empieza a las 05:00 UTC", () => {
  const start = colombiaDayStart(new Date("2026-09-30T20:00:00Z"))
  assert.equal(start.toISOString(), "2026-09-30T05:00:00.000Z")
})

test("pasadas las 7 pm en Colombia (ya es mañana en UTC) sigue siendo el mismo día", () => {
  const start = colombiaDayStart(new Date("2026-10-01T02:30:00Z"))
  assert.equal(start.toISOString(), "2026-09-30T05:00:00.000Z")
})

test("justo antes de la medianoche colombiana todavía es el día anterior", () => {
  const start = colombiaDayStart(new Date("2026-10-01T04:59:59Z"))
  assert.equal(start.toISOString(), "2026-09-30T05:00:00.000Z")
  const next = colombiaDayStart(new Date("2026-10-01T05:00:00Z"))
  assert.equal(next.toISOString(), "2026-10-01T05:00:00.000Z")
})

test("getColombiaDayRange devuelve 24 horas exactas", () => {
  const { today, tomorrow } = getColombiaDayRange(new Date("2026-09-30T16:23:00Z"))
  assert.equal(today.toISOString(), "2026-09-30T05:00:00.000Z")
  assert.equal(tomorrow.getTime() - today.getTime(), 24 * 60 * 60 * 1000)
})
