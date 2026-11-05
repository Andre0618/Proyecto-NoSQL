import { test } from "node:test"
import assert from "node:assert/strict"

import { quickCashAmounts } from "./cash"

test("ofrece el exacto y los billetes redondos de arriba, sin repetir", () => {
  assert.deepEqual(quickCashAmounts(84_000), [84_000, 90_000, 100_000])
  assert.deepEqual(quickCashAmounts(23_500), [23_500, 30_000, 40_000, 50_000])
})

test("un total ya redondo no se repite como exacto", () => {
  assert.deepEqual(quickCashAmounts(30_000), [30_000, 40_000, 50_000, 100_000])
  assert.deepEqual(quickCashAmounts(100_000), [100_000])
})

test("sin nada por pagar no hay opciones", () => {
  assert.deepEqual(quickCashAmounts(0), [])
  assert.deepEqual(quickCashAmounts(Number.NaN), [])
})
