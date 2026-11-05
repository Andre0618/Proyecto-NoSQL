import { test } from "node:test"
import assert from "node:assert/strict"

import { scopeArgs, isTenantModel, TenantScopeError } from "./tenantScope"
import { runWithTenant, currentTenant } from "./tenant"

const A = "11111111-1111-4111-8111-111111111111"
const B = "22222222-2222-4222-8222-222222222222"

test("una lectura sin filtro queda limitada al restaurante", () => {
  assert.deepEqual(scopeArgs("Order", "findMany", { orderBy: { createdAt: "desc" } }, A), {
    orderBy: { createdAt: "desc" },
    where: { restaurantId: A },
  })
  assert.deepEqual(scopeArgs("Product", "count", undefined, A), { where: { restaurantId: A } })
})

test("conserva los demás filtros y agrega el restaurante", () => {
  const out = scopeArgs("Order", "findFirst", { where: { tableId: "t1", status: "ABIERTA" } }, A)
  assert.deepEqual(out, { where: { tableId: "t1", status: "ABIERTA", restaurantId: A } })
})

test("buscar por id ya no alcanza un registro de otro restaurante", () => {
  const out = scopeArgs("Table", "findUnique", { where: { id: "t1" } }, A)
  assert.deepEqual(out, { where: { id: "t1", restaurantId: A } })
})

test("update, delete y updateMany también quedan limitados", () => {
  for (const op of ["update", "delete", "updateMany", "deleteMany"]) {
    const out = scopeArgs("Product", op, { where: { id: "p1" }, data: { stock: 3 } }, A) as { where: object }
    assert.deepEqual(out.where, { id: "p1", restaurantId: A }, op)
  }
})

test("repetir el mismo restaurante en el filtro es válido (el código existente ya lo hace)", () => {
  const out = scopeArgs("CashMovement", "findMany", { where: { restaurantId: A, type: "GASTO" } }, A)
  assert.deepEqual(out, { where: { restaurantId: A, type: "GASTO" } })
})

test("filtrar por OTRO restaurante falla en vez de devolver sus datos", () => {
  assert.throws(() => scopeArgs("Order", "findMany", { where: { restaurantId: B } }, A), TenantScopeError)
  assert.throws(() => scopeArgs("Product", "findUnique", { where: { id: "p1", restaurantId: B } }, A), TenantScopeError)
})

test("un filtro que no es igualdad simple se rechaza, no se interpreta", () => {
  assert.throws(() => scopeArgs("Order", "findMany", { where: { restaurantId: { in: [A, B] } } }, A), TenantScopeError)
})

test("crear pone el restaurante y no deja crear en otro", () => {
  assert.deepEqual(scopeArgs("Category", "create", { data: { name: "Bebidas" } }, A), {
    data: { name: "Bebidas", restaurantId: A },
  })
  assert.throws(() => scopeArgs("Category", "create", { data: { name: "x", restaurantId: B } }, A), TenantScopeError)
  assert.throws(() => scopeArgs("Category", "create", { data: { name: "x", restaurant: { connect: { id: A } } } }, A), TenantScopeError)
})

test("createMany marca cada fila", () => {
  const out = scopeArgs("Table", "createMany", { data: [{ number: 1 }, { number: 2 }] }, A) as { data: object[] }
  assert.deepEqual(out.data, [{ number: 1, restaurantId: A }, { number: 2, restaurantId: A }])
})

test("un update no puede mover un registro a otro restaurante", () => {
  assert.throws(() => scopeArgs("Product", "update", { where: { id: "p1" }, data: { restaurantId: B } }, A), TenantScopeError)
  assert.throws(() => scopeArgs("Product", "updateMany", { where: {}, data: { restaurant: { connect: { id: B } } } }, A), TenantScopeError)
})

test("upsert limita el filtro y la creación", () => {
  const out = scopeArgs("DailySummary", "upsert", {
    where: { id: "d1" }, create: { totalIngresos: 1 }, update: { totalIngresos: 2 },
  }, A) as { where: object; create: object }
  assert.deepEqual(out.where, { id: "d1", restaurantId: A })
  assert.deepEqual(out.create, { totalIngresos: 1, restaurantId: A })
})

test("el restaurante se limita por su propio id y no se crea desde una petición", () => {
  assert.deepEqual(scopeArgs("Restaurant", "findUnique", { where: { id: A } }, A), { where: { id: A } })
  assert.throws(() => scopeArgs("Restaurant", "findUnique", { where: { id: B } }, A), TenantScopeError)
  assert.throws(() => scopeArgs("Restaurant", "create", { data: { name: "x" } }, A), TenantScopeError)
})

test("OrderItem no tiene restaurantId: se limita por su orden", () => {
  assert.deepEqual(scopeArgs("OrderItem", "findMany", { where: { orderId: "o1" } }, A), {
    where: { orderId: "o1", order: { restaurantId: A } },
  })
  assert.deepEqual(scopeArgs("OrderItem", "delete", { where: { id: "i1" } }, A), {
    where: { id: "i1", order: { restaurantId: A } },
  })
  assert.throws(() => scopeArgs("OrderItem", "findMany", { where: { order: { restaurantId: B } } }, A), TenantScopeError)
  assert.throws(() => scopeArgs("OrderItem", "findMany", { where: { order: { is: {} } } }, A), TenantScopeError)
  // crear un ítem no cambia: la orden se verificó antes
  assert.deepEqual(scopeArgs("OrderItem", "create", { data: { orderId: "o1", quantity: 1 } }, A), {
    data: { orderId: "o1", quantity: 1 },
  })
})

test("sin restaurante en la petición, un modelo del tenant falla cerrado", () => {
  for (const model of ["User", "Order", "Product", "Table", "Category", "CashMovement", "EmployeePayment", "DailySummary", "Restaurant", "OrderItem"]) {
    assert.ok(isTenantModel(model), model)
    assert.throws(() => scopeArgs(model, "findMany", {}, undefined), TenantScopeError, model)
  }
})

test("un modelo que no es del tenant pasa sin cambios", () => {
  const args = { where: { x: 1 } }
  assert.equal(scopeArgs("AlgoGlobal", "findMany", args, undefined), args)
  assert.equal(isTenantModel("AlgoGlobal"), false)
})

test("el contexto viaja por las llamadas asíncronas de la petición y no se mezcla entre peticiones", async () => {
  assert.equal(currentTenant(), undefined)

  const seen: Array<string | undefined> = []
  const request = (id: string, delay: number) =>
    runWithTenant(id, async () => {
      await new Promise(r => setTimeout(r, delay))
      seen.push(`${id}:${currentTenant()}`)
      await Promise.resolve()
      return currentTenant()
    })

  const [a, b] = await Promise.all([request("A", 20), request("B", 5)])
  assert.equal(a, "A")
  assert.equal(b, "B")
  assert.deepEqual(seen.sort(), ["A:A", "B:B"])
  assert.equal(currentTenant(), undefined)
})
