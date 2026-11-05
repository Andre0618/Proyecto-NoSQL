"use client"

import { useEffect, useSyncExternalStore } from "react"
import { renderEscPos, renderLines, type Op } from "@/lib/escpos"

// Impresora térmica por USB con WebUSB (Chrome en Android o en computador).
// Solo funciona en https o localhost; el permiso se pide una vez y queda recordado.

// tipos mínimos de WebUSB; TypeScript no los trae
type UsbEndpoint = { endpointNumber: number; direction: "in" | "out"; type: string }
type UsbAlternate = { alternateSetting: number; interfaceClass: number; endpoints: UsbEndpoint[] }
type UsbInterface = { interfaceNumber: number; claimed: boolean; alternates: UsbAlternate[] }
type UsbDevice = {
  vendorId: number
  productId: number
  productName?: string
  manufacturerName?: string
  opened: boolean
  configuration: { interfaces: UsbInterface[] } | null
  configurations: { configurationValue: number }[]
  open(): Promise<void>
  close(): Promise<void>
  forget?(): Promise<void>
  selectConfiguration(n: number): Promise<void>
  claimInterface(n: number): Promise<void>
  releaseInterface(n: number): Promise<void>
  selectAlternateInterface(i: number, a: number): Promise<void>
  transferOut(endpoint: number, data: BufferSource): Promise<{ status: "ok" | "stall" | "babble"; bytesWritten: number }>
  clearHalt(direction: "in" | "out", endpoint: number): Promise<void>
}
type UsbApi = {
  requestDevice(options: { filters: unknown[] }): Promise<UsbDevice>
  getDevices(): Promise<UsbDevice[]>
  addEventListener(type: "connect" | "disconnect", cb: (e: { device: UsbDevice }) => void): void
}

// la impresora ya abierta y la salida por donde le llegan los bytes
type Link = { device: UsbDevice; iface: number; endpoint: number }

export type PrinterStatus = "unsupported" | "disconnected" | "connecting" | "ready"

export type PrinterMethod = "usb" | "rawbt"

export type PrinterSettings = {
  /** "usb": Chrome habla directo con la impresora; "rawbt": se la entrega a la app RawBT (tablets donde el USB directo no deja) */
  method: PrinterMethod
  /** 42 (área de 72 mm) o 48 */
  cols: 42 | 48
  asciiOnly: boolean
  autoPrint: boolean
  footer: string
}

type PrinterState = {
  status: PrinterStatus
  deviceName: string
  error: string
  detail: string
  settings: PrinterSettings
}

export class PrinterError extends Error {
  constructor(public code: "NOT_CONNECTED" | "WRITE_FAILED" | "UNSUPPORTED", message: string) {
    super(message)
  }
}

export const DEFAULT_SETTINGS: PrinterSettings = { method: "usb", cols: 42, asciiOnly: false, autoPrint: true, footer: "" }

const SETTINGS_KEY = "printer:settings"
const LAST_KEY = "printer:last"
const CHUNK = 4096
// más que esto sin recibir datos ya no es una impresión lenta: es un atasco (sin papel, tapa abierta)
const TRANSFER_TIMEOUT = 10_000

export const OPEN_PRINTER_EVENT = "open-printer-settings"

const SERVER_STATE: PrinterState = { status: "disconnected", deviceName: "", error: "", detail: "", settings: DEFAULT_SETTINGS }

const detailOf = (err: unknown) => {
  const e = err as { name?: string; message?: string }
  return [e?.name, e?.message].filter(Boolean).join(": ")
}

let state: PrinterState = SERVER_STATE
let active: Link | null = null
let initialized = false
const listeners = new Set<() => void>()

const set = (partial: Partial<PrinterState>) => {
  state = { ...state, ...partial }
  listeners.forEach(l => l())
}

const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

const usbApi = (): UsbApi | undefined =>
  typeof navigator === "undefined" ? undefined : (navigator as unknown as { usb?: UsbApi }).usb

const readJson = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}
const writeJson = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* sin almacenamiento: no se recuerda */ }
}

const nameOf = (d: UsbDevice) =>
  [d.manufacturerName, d.productName].filter(Boolean).join(" ") ||
  `USB ${d.vendorId.toString(16).padStart(4, "0")}:${d.productId.toString(16).padStart(4, "0")}`

// interfaz de impresora (clase 7) y su salida; si no hay, cualquier salida bulk
const findTarget = (device: UsbDevice) => {
  const interfaces = device.configuration?.interfaces ?? []
  for (const wantClass of [7, -1]) {
    for (const iface of interfaces) {
      for (const alt of iface.alternates) {
        if (wantClass !== -1 && alt.interfaceClass !== wantClass) continue
        const out = alt.endpoints.find(e => e.direction === "out" && e.type === "bulk")
        if (out) return { iface: iface.interfaceNumber, alt: alt.alternateSetting, endpoint: out.endpointNumber }
      }
    }
  }
  return null
}

// suelta la interfaz y cierra el dispositivo; así un intento fallido no deja la impresora retenida
const releaseQuietly = async (device: UsbDevice, iface?: number) => {
  try { if (iface !== undefined && device.opened) await device.releaseInterface(iface) } catch { /* ya estaba suelta */ }
  try { if (device.opened) await device.close() } catch { /* ya estaba cerrado */ }
}

// dice en qué paso falló, para poder explicarlo bien
type AttachStep = "open" | "config" | "target" | "claim"
class AttachFailure extends Error {
  constructor(public step: AttachStep, public original: unknown) {
    super(detailOf(original))
  }
}

const attachNow = async (device: UsbDevice) => {
  // ya conectada con este mismo dispositivo: no se abre dos veces
  if (active?.device === device && device.opened) {
    set({ status: "ready", deviceName: nameOf(device), error: "", detail: "" })
    return
  }

  let step: AttachStep = "open"
  let claimed: number | undefined
  try {
    if (!device.opened) await device.open()
    step = "config"
    if (device.configuration === null) {
      await device.selectConfiguration(device.configurations[0]?.configurationValue ?? 1)
    }
    step = "target"
    const target = findTarget(device)
    if (!target) throw new Error("Esta conexión USB no tiene salida de impresión.")
    step = "claim"
    const iface = device.configuration?.interfaces.find(i => i.interfaceNumber === target.iface)
    if (!iface?.claimed) {
      await device.claimInterface(target.iface)
      claimed = target.iface
    }
    if (target.alt !== 0) await device.selectAlternateInterface(target.iface, target.alt)
    active = { device, iface: target.iface, endpoint: target.endpoint }
  } catch (err) {
    await releaseQuietly(device, claimed)
    throw new AttachFailure(step, err)
  }
  writeJson(LAST_KEY, { vendorId: device.vendorId, productId: device.productId })
  set({ status: "ready", deviceName: nameOf(device), error: "", detail: "" })
}

// un solo intento a la vez: el reconectar automático y el botón no se pisan abriendo el mismo dispositivo
let queue: Promise<unknown> = Promise.resolve()
const attach = (device: UsbDevice) => {
  const run = queue.then(() => attachNow(device))
  queue = run.catch(() => {})
  return run
}

const FRIENDLY_OPEN_ERROR =
  "No se pudo abrir la impresora. Desconecta y vuelve a conectar el cable USB, acepta el permiso del equipo e intenta de nuevo."

// el mensaje depende de qué falló, no es el mismo problema en todos los casos
const explain = (err: unknown): { error: string; detail: string } => {
  const step = err instanceof AttachFailure ? err.step : undefined
  const original = err instanceof AttachFailure ? err.original : err
  const name = (original as { name?: string })?.name

  let error = FRIENDLY_OPEN_ERROR
  if (step === "open" && name === "SecurityError") {
    error =
      "El sistema no deja abrir la impresora. En Windows suele faltar el driver WinUSB (instálalo con Zadig); " +
      "en Android, el permiso USB. Cierra también otras pestañas o programas que usen la impresora."
  } else if (step === "claim") {
    error =
      "La impresora está tomada por otro programa o por el sistema. Cierra otras pestañas con la app, " +
      "desconecta y vuelve a conectar el cable USB, y prueba de nuevo."
  } else if (name === "InvalidStateError") {
    error = "La impresora quedó a medias. Desconecta y vuelve a conectar el cable USB e intenta de nuevo."
  }
  return { error, detail: [step && `paso: ${step}`, detailOf(original)].filter(Boolean).join(" · ") }
}

// reconecta con una impresora ya autorizada, sin pedir permiso
export const reconnectPrinter = async () => {
  const usb = usbApi()
  if (!usb) return
  try {
    const devices = await usb.getDevices()
    const last = readJson<{ vendorId: number; productId: number }>(LAST_KEY)
    const pick =
      devices.find(d => last && d.vendorId === last.vendorId && d.productId === last.productId) ??
      (devices.length === 1 ? devices[0] : undefined)
    if (!pick) {
      active = null
      set({ status: "disconnected", deviceName: "" })
      return
    }
    await attach(pick)
  } catch (err) {
    active = null
    console.error("[impresora] no se pudo reconectar", err)
    set({ status: "disconnected", deviceName: "", ...explain(err) })
  }
}

// abre el selector del navegador; hay que llamarla desde un toque del usuario
export const connectPrinter = async () => {
  const usb = usbApi()
  if (!usb) throw new PrinterError("UNSUPPORTED", "Este navegador no puede conectarse a la impresora por USB. Usa Chrome.")
  set({ status: "connecting", error: "" })
  try {
    // Gainscha/Digital POS (0x0fe6) o cualquier dispositivo de clase impresora (7)
    const device = await usb.requestDevice({ filters: [{ vendorId: 0x0fe6 }, { classCode: 7 }] })
    await attach(device)
  } catch (err) {
    active = null
    const cancelled = (err as { name?: string })?.name === "NotFoundError"
    if (!cancelled) console.error("[impresora] no se pudo conectar", err)
    set({
      status: "disconnected", deviceName: "",
      ...(cancelled ? { error: "", detail: "" } : explain(err)),
    })
  }
}

// suelta la impresora de verdad y le quita el permiso al sitio
export const disconnectPrinter = () => {
  const link = active
  active = null
  if (link) {
    void releaseQuietly(link.device, link.iface).then(() => link.device.forget?.().catch(() => {}))
  }
  try { localStorage.removeItem(LAST_KEY) } catch { /* nada que olvidar */ }
  set({ status: "disconnected", deviceName: "", error: "", detail: "" })
}

// RawBT no se puede consultar: se da por lista y se sabrá al imprimir. Con USB se suelta lo que hubiera abierto.
const applyMethod = (method: PrinterMethod) => {
  if (method === "rawbt") {
    const link = active
    active = null
    if (link) void releaseQuietly(link.device, link.iface)
    set({ status: "ready", deviceName: "RawBT", error: "", detail: "" })
    return
  }
  set({ status: usbApi() ? "disconnected" : "unsupported", deviceName: "", error: "", detail: "" })
  startUsb()
}

export const updatePrinterSettings = (partial: Partial<PrinterSettings>) => {
  const settings = { ...state.settings, ...partial }
  writeJson(SETTINGS_KEY, settings)
  const switched = settings.method !== state.settings.method
  set({ settings })
  if (switched) applyMethod(settings.method)
}

// lee la conexión actual; una función evita que TypeScript la dé por nula tras reconectar
const currentLink = (): Link | null => active

const TIMEOUT_MESSAGE = "La impresora no respondió a tiempo"

// WebUSB no tiene timeout: si la impresora deja de recibir (sin papel, tapa abierta), la transferencia no termina
// nunca y las siguientes se quedan en cola detrás de ella. Al vencer el plazo se cierra el equipo: close() rechaza
// lo pendiente y suelta la interfaz, y la próxima impresión lo vuelve a abrir.
const sendChunk = async (link: Link, chunk: Uint8Array<ArrayBuffer>) => {
  let timer: number | undefined
  const expired = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => {
      // primero el rechazo: así el motivo que queda es el plazo y no el AbortError que provoca el cierre
      reject(new Error(TIMEOUT_MESSAGE))
      link.device.close().catch(() => { /* ya se estaba cerrando o se desconectó */ })
    }, TRANSFER_TIMEOUT)
  })
  try {
    let result = await Promise.race([link.device.transferOut(link.endpoint, chunk), expired])
    // "stall": la impresora frenó la salida; se libera y se reenvía lo que no alcanzó a recibir
    if (result.status === "stall") {
      await link.device.clearHalt("out", link.endpoint)
      result = await Promise.race([link.device.transferOut(link.endpoint, chunk.slice(result.bytesWritten)), expired])
    }
    if (result.status !== "ok") throw new Error(result.status)
  } finally {
    window.clearTimeout(timer)
  }
}

// `started` dice si ya salió algún pedazo del tiquete antes de fallar
class WriteFailure extends Error {
  constructor(public started: boolean, public original: unknown) {
    super(detailOf(original))
  }
}

const writeAll = async (link: Link, bytes: Uint8Array) => {
  for (let i = 0; i < bytes.length; i += CHUNK) {
    try {
      await sendChunk(link, bytes.slice(i, i + CHUNK))
    } catch (err) {
      throw new WriteFailure(i > 0, err)
    }
  }
}

// Fallar de inmediato, sin haber enviado nada y sin esperar el plazo, es una conexión vieja (por ejemplo el puerto
// USB de la tablet dormido). Si ya salió algo o venció el plazo no se reintenta: saldría el tiquete duplicado.
const isStaleConnection = (err: unknown) =>
  err instanceof WriteFailure && !err.started && (err.original as { message?: string })?.message !== TIMEOUT_MESSAGE

const toBase64 = (bytes: Uint8Array) => {
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

// RawBT recibe los bytes ESC/POS en un enlace y los manda a la impresora con la API USB nativa de Android.
// Chrome solo abre apps externas desde un toque del usuario (o poco después de uno).
const printViaRawBt = (bytes: Uint8Array) => {
  const link = document.createElement("a")
  link.href = `rawbt:base64,${toBase64(bytes)}`
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export const printOps = async (ops: Op[]) => {
  if (state.settings.method === "rawbt") {
    printViaRawBt(renderEscPos(ops, { cols: state.settings.cols, asciiOnly: state.settings.asciiOnly }))
    return
  }
  if (!usbApi()) throw new PrinterError("UNSUPPORTED", "Este navegador no puede imprimir por USB. Usa Chrome.")
  if (!active) await reconnectPrinter()
  const link = active
  if (!link) throw new PrinterError("NOT_CONNECTED", "La impresora no está conectada. Conéctala en «Impresora».")

  const bytes = renderEscPos(ops, { cols: state.settings.cols, asciiOnly: state.settings.asciiOnly })
  let used = link
  try {
    try {
      await writeAll(used, bytes)
    } catch (first) {
      if (!isStaleConnection(first)) throw first
      // se reabre la conexión y se reintenta una sola vez
      await releaseQuietly(used.device, used.iface)
      active = null
      await reconnectPrinter()
      const fresh = currentLink()
      if (!fresh) throw first
      used = fresh
      await writeAll(used, bytes)
    }
  } catch (err) {
    const original = err instanceof WriteFailure ? err.original : err
    // si mientras tanto se desconectó y se volvió a conectar, la conexión nueva no se toca
    if (currentLink() === used) {
      active = null
      await releaseQuietly(used.device, used.iface)
      set({
        status: "disconnected", deviceName: "",
        error: "La impresora no respondió. Revisa el papel, la tapa y el cable.",
        detail: detailOf(original),
      })
    }
    throw new PrinterError(
      "WRITE_FAILED",
      "No se pudo imprimir. Revisa que la impresora esté encendida, con papel y la tapa cerrada, y que el cable esté conectado."
    )
  }
}

// para equipos sin USB directo; papel de 80 mm
export const printInBrowser = (ops: Op[]) => {
  const lines = renderLines(ops, { cols: state.settings.cols })
  const iframe = document.createElement("iframe")
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0"
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument
  const win = iframe.contentWindow
  if (!doc || !win) { iframe.remove(); return }
  doc.open()
  doc.write(
    '<!doctype html><html><head><meta charset="utf-8"><title>Tiquete</title><style>' +
    "@page{size:80mm auto;margin:0}html,body{margin:0}" +
    'pre{font:12px/1.25 "Courier New",monospace;width:72mm;margin:0 auto;padding:4mm 0;white-space:pre}' +
    "div{min-height:1.25em}.big{font-size:24px;line-height:1.1}.bold{font-weight:bold}" +
    "</style></head><body><pre></pre></body></html>"
  )
  doc.close()
  const pre = doc.querySelector("pre")
  if (pre) {
    for (const l of lines) {
      const div = doc.createElement("div")
      div.className = [l.big ? "big" : "", l.bold ? "bold" : ""].join(" ").trim()
      div.textContent = l.text
      pre.appendChild(div)
    }
  }
  win.focus()
  win.print()
  window.setTimeout(() => iframe.remove(), 3000)
}

let usbListening = false

// escucha la impresora por USB y reconecta; solo aplica al método "usb"
const startUsb = () => {
  const usb = usbApi()
  if (!usb) return
  if (!usbListening) {
    usbListening = true
    usb.addEventListener("connect", () => {
      // con la impresora ya lista, lo que se conectó es otro aparato
      if (!active && state.settings.method === "usb") void reconnectPrinter()
    })
    usb.addEventListener("disconnect", e => {
      // un lector de códigos o un teclado en el mismo adaptador OTG no es la impresora
      if (e.device !== active?.device) return
      active = null
      set({ status: "disconnected", deviceName: "" })
    })
  }
  void reconnectPrinter()
}

const init = () => {
  if (initialized || typeof window === "undefined") return
  initialized = true
  const settings = { ...DEFAULT_SETTINGS, ...(readJson<Partial<PrinterSettings>>(SETTINGS_KEY) ?? {}) }
  state = { ...state, settings }
  if (settings.method === "rawbt") {
    set({ settings, status: "ready", deviceName: "RawBT" })
    return
  }
  const usb = usbApi()
  set({ settings, status: usb ? "disconnected" : "unsupported" })
  startUsb()
}

export const usePrinter = () => {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => SERVER_STATE)
  useEffect(() => { init() }, [])
  return {
    ...snapshot,
    supported: snapshot.status !== "unsupported",
    connect: connectPrinter,
    disconnect: disconnectPrinter,
    print: printOps,
    printInBrowser,
    updateSettings: updatePrinterSettings,
  }
}
