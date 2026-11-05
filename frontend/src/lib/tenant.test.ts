import { test } from "node:test"
import assert from "node:assert/strict"

import { DEFAULT_SETTINGS, hasFeature, tenantSettings } from "./tenant"
import type { CurrentUser } from "../types/api"

const base: CurrentUser = { id: "u", name: "A", email: "a@a.co", role: "ADMIN", restaurantId: "r" }

test("sin sesión no hay funcionalidades", () => {
  assert.equal(hasFeature(null, "pdf_reports"), false)
})

test("una sesión vieja, sin datos del plan, asume que tiene todo (el servidor decide de verdad)", () => {
  assert.equal(hasFeature(base, "cash_management"), true)
  assert.deepEqual(tenantSettings(base), DEFAULT_SETTINGS)
})

test("con plan, solo están las funcionalidades que trae", () => {
  const user: CurrentUser = { ...base, tenant: { plan: "BASICO", features: ["pdf_reports"], settings: DEFAULT_SETTINGS } }
  assert.equal(hasFeature(user, "pdf_reports"), true)
  assert.equal(hasFeature(user, "cash_management"), false)
})

test("la configuración del restaurante manda sobre los valores por defecto", () => {
  const user: CurrentUser = {
    ...base,
    tenant: { plan: "PRO", features: [], settings: { tipPercent: 0, paymentMethods: ["Efectivo"] } },
  }
  assert.equal(tenantSettings(user).tipPercent, 0)
  assert.deepEqual(tenantSettings(user).paymentMethods, ["Efectivo"])
})
