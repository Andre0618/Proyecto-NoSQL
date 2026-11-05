import { test } from "node:test"
import assert from "node:assert/strict"

import { renderEscPos, renderPlain, encodeText, wrap, row } from "./escpos"
import { buildReceipt, buildTestReceipt, suggestedTip } from "./receipt"

const hex = (b: ArrayLike<number>) => Array.from(b).map(x => x.toString(16).padStart(2, "0")).join(" ")
const ascii = (b: ArrayLike<number>) => String.fromCharCode(...Array.from(b))

test("tildes y ñ salen en PC850", () => {
  assert.equal(hex(encodeText("ñÑáéíóú", false)), "a4 a5 a0 82 a1 a2 a3")
  assert.equal(hex(encodeText("ÁÉÍÓÚ", false)), "b5 90 d6 e0 e9")
  assert.equal(hex(encodeText("¿¡", false)), "a8 ad")
})

test("modo sin tildes", () => {
  assert.equal(ascii(encodeText("Ñoquis á é ¿", true)), "Noquis a e ?")
})

test("espacios raros de la hora se vuelven espacios y lo desconocido un ?", () => {
  assert.equal(ascii(encodeText("11:58 p. m.", false)), "11:58 p. m.")
  assert.equal(ascii(encodeText("日", false)), "?")
})

test("wrap no corta palabras, salvo que no quepan", () => {
  assert.deepEqual(wrap("Limonada de coco con hielo y menta", 20), ["Limonada de coco con", "hielo y menta"])
  assert.ok(wrap("Supercalifragilistico", 10).every(l => l.length <= 10))
})

test("row deja el precio pegado a la derecha", () => {
  const [line, ...rest] = row("2 Bandeja paisa", "$68.000", 42)
  assert.equal(rest.length, 0)
  assert.equal(line.length, 42)
  assert.ok(line.startsWith("2 Bandeja paisa") && line.endsWith("$68.000"))
})

test("row con producto largo mantiene el precio en la primera línea", () => {
  const lines = row("1 Limonada de coco con hielo y menta extra grande", "$8.500", 42)
  assert.ok(lines.length >= 2)
  assert.ok(lines[0].endsWith("$8.500"))
  assert.ok(lines.every(l => l.length <= 42))
})

test("propina sugerida con otro porcentaje: el 10 % sigue igual, 0 % no sugiere nada y el total sigue en billetes", () => {
  assert.equal(suggestedTip(53500, 10), suggestedTip(53500))
  assert.equal(suggestedTip(53500, 0), 0)
  for (const percent of [5, 8, 12, 15, 20]) {
    for (const subtotal of [15500, 53500, 76000, 105500, 150000]) {
      const tip = suggestedTip(subtotal, percent)
      assert.equal((subtotal + tip) % 1000, 0, `${percent}% de ${subtotal}`)
      // queda a menos de un billete de la propina exacta
      assert.ok(Math.abs(tip - subtotal * percent / 100) <= 1000, `${percent}% de ${subtotal} dio ${tip}`)
    }
  }
})

test("propina sugerida: cerca del 10% y con el total en billetes", () => {
  const casos: [number, number][] = [
    [53500, 5500],   // total 59.000
    [15500, 1500],   // total 17.000
    [145500, 14500], // total 160.000
    [155000, 15000], // 170.500 queda entre dos billetes: se baja
    [150000, 15000],
    [105500, 10500],
    [76000, 8000],
    [4000, 0],
  ]
  for (const [subtotal, tip] of casos) {
    assert.equal(suggestedTip(subtotal), tip, `subtotal ${subtotal}`)
    assert.equal((subtotal + tip) % 1000, 0, `el total de ${subtotal} debe ser en billetes`)
  }
})

test("tiquete de prueba cabe en 42 y en 48 columnas", () => {
  const ops = buildTestReceipt("La Fogata", "")
  const at42 = renderPlain(ops, { cols: 42 })
  assert.ok(at42.split("\n").every(l => l.length <= 42))
  assert.ok(at42.includes("$105.500") && at42.includes("$10.500") && at42.includes("$116.000"))

  const at48 = renderPlain(ops, { cols: 48 })
  assert.ok(at48.split("\n").every(l => l.length <= 48))
  assert.ok(at48.split("\n").some(l => l.length > 42))
})

test("bytes ESC/POS: inicia en PC850, corta al final y usa doble tamaño en el total", () => {
  const bytes = renderEscPos(buildTestReceipt("La Fogata", ""), { cols: 42, asciiOnly: false })
  assert.equal(hex(bytes.slice(0, 5)), "1b 40 1b 74 02")
  assert.equal(hex(bytes.slice(-4)), "1d 56 42 00")
  assert.ok(hex(bytes).includes("1d 21 11") && hex(bytes).includes("1d 21 00"))
  assert.ok(Array.from(bytes).includes(0xa5) && Array.from(bytes).includes(0xad))
})

test("modo sin tildes no cambia de código de página", () => {
  const bytes = renderEscPos(buildTestReceipt("La Fogata", ""), { cols: 42, asciiOnly: true })
  assert.equal(hex(bytes.slice(0, 2)), "1b 40")
  assert.notEqual(hex(bytes.slice(0, 5)), "1b 40 1b 74 02")
})

test("comprobante de pago trae subtotal, propina, total, método y pie", () => {
  const ops = buildReceipt({
    kind: "pago",
    restaurant: "La Fogata",
    table: 4,
    orderCode: "a41f9c02",
    waiter: "Andrés Ruiz",
    date: new Date("2026-09-30T02:15:00Z"),
    items: [
      { name: "Bandeja paisa", quantity: 2, unitPrice: 34000 },
      { name: "Limonada", quantity: 2, unitPrice: 4000 },
    ],
    subtotal: 76000,
    tip: 7600,
    paymentMethod: "Efectivo",
    footer: "Síguenos en @lafogata",
  })
  const text = renderPlain(ops, { cols: 42 })
  for (const piece of ["$76.000", "$7.600", "$83.600", "Efectivo", "Síguenos en @lafogata"]) {
    assert.ok(text.includes(piece), `falta ${piece}`)
  }
})

test("comprobante de pago en efectivo trae con cuánto pagó y la devuelta, solo si se anotó", () => {
  const base = {
    kind: "pago" as const,
    restaurant: "La Fogata",
    table: 4,
    orderCode: "a41f9c02",
    date: new Date("2026-09-30T02:15:00Z"),
    items: [{ name: "Bandeja paisa", quantity: 2, unitPrice: 34000 }],
    subtotal: 68000,
    tip: 7000,
    paymentMethod: "Efectivo",
  }
  const conDevuelta = renderPlain(buildReceipt({ ...base, cashReceived: 100000, change: 25000 }), { cols: 42 })
  assert.match(conDevuelta, /Recibido en efectivo\s+\$100\.000/)
  assert.match(conDevuelta, /Devuelta\s+\$25\.000/)

  const sinDevuelta = renderPlain(buildReceipt(base), { cols: 42 })
  assert.ok(!sinDevuelta.includes("Devuelta"))
})
