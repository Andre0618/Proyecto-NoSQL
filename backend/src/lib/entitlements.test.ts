import { test } from "node:test"
import assert from "node:assert/strict"

import { FEATURES, PLAN_FEATURES, parseFlags, resolveFeatures } from "./entitlements"
import { DEFAULT_SETTINGS, PAYMENT_METHODS, SettingsPatchSchema, mergeSettings, parseSettings } from "./tenantSettings"

test("el plan PRO trae todas las funcionalidades: los restaurantes que ya existían no pierden nada", () => {
  assert.deepEqual(resolveFeatures("PRO", {}), [...FEATURES])
  assert.deepEqual([...PLAN_FEATURES.PRO], [...FEATURES])
})

test("el plan BASICO no trae funcionalidades extra", () => {
  assert.deepEqual(resolveFeatures("BASICO", {}), [])
})

test("una excepción prende lo que el plan no trae y otra apaga lo que sí trae", () => {
  assert.deepEqual(resolveFeatures("BASICO", { pdf_reports: true }), ["pdf_reports"])
  assert.deepEqual(resolveFeatures("PRO", { pdf_reports: false }), ["cash_management"])
})

test("las excepciones mal formadas se ignoran y no activan nada por accidente", () => {
  assert.deepEqual(resolveFeatures("BASICO", { pdf_reports: "true", cash_management: 1, inventada: true }), [])
  assert.deepEqual(resolveFeatures("BASICO", null), [])
  assert.deepEqual(resolveFeatures("BASICO", ["pdf_reports"]), [])
  assert.deepEqual(parseFlags("texto"), {})
})

test("la configuración vacía toma los valores de siempre: propina del 10 % y todos los medios de pago", () => {
  assert.equal(DEFAULT_SETTINGS.tipPercent, 10)
  assert.deepEqual(DEFAULT_SETTINGS.paymentMethods, [...PAYMENT_METHODS])
  assert.deepEqual(parseSettings({}), DEFAULT_SETTINGS)
  assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS)
})

test("una configuración guardada que ya no es válida cae a los valores por defecto en vez de romper", () => {
  assert.deepEqual(parseSettings({ tipPercent: 500 }), DEFAULT_SETTINGS)
  assert.deepEqual(parseSettings({ paymentMethods: [] }), DEFAULT_SETTINGS)
})

test("se puede cambiar un campo y los demás se conservan", () => {
  const patch = SettingsPatchSchema.parse({ tipPercent: 12 })
  const merged = mergeSettings(DEFAULT_SETTINGS, patch)
  assert.ok(merged.success)
  assert.equal(merged.data.tipPercent, 12)
  assert.deepEqual(merged.data.paymentMethods, [...PAYMENT_METHODS])
})

test("el administrador no puede guardar campos desconocidos ni valores fuera de rango", () => {
  assert.equal(SettingsPatchSchema.safeParse({ plan: "PRO" }).success, false)
  assert.equal(SettingsPatchSchema.safeParse({ tipPercent: 31 }).success, false)
  assert.equal(SettingsPatchSchema.safeParse({ tipPercent: 10.5 }).success, false)
  assert.equal(SettingsPatchSchema.safeParse({ paymentMethods: [] }).success, false)
  assert.equal(SettingsPatchSchema.safeParse({ paymentMethods: ["Bitcoin"] }).success, false)
  assert.equal(SettingsPatchSchema.safeParse({ paymentMethods: ["Efectivo", "Efectivo"] }).success, false)
})

test("el pago mixto exige efectivo y una transferencia", () => {
  const sinTransferencia = mergeSettings(DEFAULT_SETTINGS, { paymentMethods: ["Efectivo", "Mixto"] })
  assert.equal(sinTransferencia.success, false)
  const sinEfectivo = mergeSettings(DEFAULT_SETTINGS, { paymentMethods: ["Nequi", "Mixto"] })
  assert.equal(sinEfectivo.success, false)
  const completo = mergeSettings(DEFAULT_SETTINGS, { paymentMethods: ["Efectivo", "Nequi", "Mixto"] })
  assert.equal(completo.success, true)
  const soloEfectivo = mergeSettings(DEFAULT_SETTINGS, { paymentMethods: ["Efectivo"] })
  assert.equal(soloEfectivo.success, true)
})
