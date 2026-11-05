// Comandos ESC/POS para impresoras térmicas de 80 mm. No depende del navegador: recibe una lista de
// operaciones y devuelve bytes, o el mismo tiquete como texto para la vista previa.

export type Align = "left" | "center" | "right"

export type Op =
  | { t: "text"; text: string; align?: Align; bold?: boolean; big?: boolean; indent?: number }
  | { t: "row"; left: string; right: string; bold?: boolean; big?: boolean }
  | { t: "rule" }
  | { t: "feed"; lines: number }
  | { t: "cut" }
  | { t: "drawer" }

export type RenderOptions = {
  /** 42 para el área de 72 mm, 48 para los 80 mm completos */
  cols: number
  /** quita tildes y ñ si la impresora no tiene ese juego de caracteres */
  asciiOnly: boolean
}

const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a

// PC850, el más común para español
const CP850: Record<string, number> = {
  "Ç": 0x80, "ü": 0x81, "é": 0x82, "â": 0x83, "ä": 0x84, "à": 0x85, "ç": 0x87, "ê": 0x88, "ë": 0x89, "è": 0x8a,
  "ï": 0x8b, "î": 0x8c, "ì": 0x8d, "É": 0x90, "ô": 0x93, "ö": 0x94, "ò": 0x95, "û": 0x96, "ù": 0x97, "Ü": 0x9a,
  "×": 0x9e, "á": 0xa0, "í": 0xa1, "ó": 0xa2, "ú": 0xa3, "ñ": 0xa4, "Ñ": 0xa5, "ª": 0xa6, "º": 0xa7, "¿": 0xa8,
  "¡": 0xad, "Á": 0xb5, "Â": 0xb6, "À": 0xb7, "Ê": 0xd2, "Ë": 0xd3, "È": 0xd4, "Í": 0xd6, "Î": 0xd7, "Ï": 0xd8,
  "Ì": 0xde, "Ó": 0xe0, "Ô": 0xe2, "Ò": 0xe3, "Ú": 0xe9, "Û": 0xea, "Ù": 0xeb, "°": 0xf8, "·": 0xfa,
}

const SYMBOLS: Record<string, string> = {
  "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "...",
  "•": "*", "€": "EUR", " ": " ", " ": " ", " ": " ", "−": "-",
}

const stripMarks = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "")

export const encodeText = (input: string, asciiOnly: boolean): number[] => {
  const out: number[] = []
  for (const original of input.normalize("NFC")) {
    const ch = SYMBOLS[original] ?? original
    for (const c of ch) {
      const code = c.codePointAt(0) ?? 63
      if (code < 0x80) { out.push(code); continue }
      if (!asciiOnly && CP850[c] !== undefined) { out.push(CP850[c]); continue }
      const plain = stripMarks(c)
      const fallback = plain.codePointAt(0)
      out.push(fallback !== undefined && fallback < 0x80 ? fallback : 0x3f)
    }
  }
  return out
}

export const wrap = (text: string, width: number): string[] => {
  const clean = text.replace(/\s+/g, " ").trim()
  if (clean === "") return [""]
  const lines: string[] = []
  let current = ""
  for (const word of clean.split(" ")) {
    let w = word
    while (w.length > width) {
      if (current) { lines.push(current); current = "" }
      lines.push(w.slice(0, width))
      w = w.slice(width)
    }
    if (current === "") current = w
    else if (current.length + 1 + w.length <= width) current += " " + w
    else { lines.push(current); current = w }
  }
  if (current) lines.push(current)
  return lines
}

export const row = (left: string, right: string, width: number): string[] => {
  const l = left.replace(/\s+/g, " ").trim()
  const r = right.trim()
  if (l.length + 1 + r.length <= width) return [l + " ".repeat(width - l.length - r.length) + r]
  if (r.length >= width - 1) return [...wrap(l, width), " ".repeat(Math.max(0, width - r.length)) + r]
  const parts = wrap(l, width - r.length - 1)
  const first = parts[0] + " ".repeat(width - parts[0].length - r.length) + r
  return [first, ...parts.slice(1)]
}

const widthOf = (op: { big?: boolean }, cols: number) => (op.big ? Math.floor(cols / 2) : cols)

const pad = (line: string, align: Align, width: number) => {
  if (align === "center") return " ".repeat(Math.max(0, Math.floor((width - line.length) / 2))) + line
  if (align === "right") return " ".repeat(Math.max(0, width - line.length)) + line
  return line
}

export type PlainLine = { text: string; bold: boolean; big: boolean }

// Líneas tal como saldrían en papel. Las "big" van al doble de tamaño, así que su texto ya viene a la mitad del ancho.
export const renderLines = (ops: Op[], opts: Pick<RenderOptions, "cols">): PlainLine[] => {
  const lines: PlainLine[] = []
  for (const op of ops) {
    if (op.t === "text") {
      const w = widthOf(op, opts.cols)
      const indent = Math.min(op.indent ?? 0, Math.max(0, w - 4))
      wrap(op.text, w - indent).forEach(l =>
        lines.push({ text: pad(" ".repeat(indent) + l, op.align ?? "left", w), bold: !!op.bold, big: !!op.big }))
    } else if (op.t === "row") {
      row(op.left, op.right, widthOf(op, opts.cols)).forEach(l => lines.push({ text: l, bold: !!op.bold, big: !!op.big }))
    } else if (op.t === "rule") {
      lines.push({ text: "-".repeat(opts.cols), bold: false, big: false })
    } else if (op.t === "feed") {
      for (let i = 0; i < op.lines; i++) lines.push({ text: "", bold: false, big: false })
    }
  }
  return lines
}

export const renderPlain = (ops: Op[], opts: Pick<RenderOptions, "cols">): string =>
  renderLines(ops, opts).map(l => l.text).join("\n")

class Bytes {
  data: number[] = []
  push(...b: number[]) { this.data.push(...b) }
}

export const renderEscPos = (ops: Op[], opts: RenderOptions): Uint8Array => {
  const b = new Bytes()
  b.push(ESC, 0x40) // reset
  if (!opts.asciiOnly) b.push(ESC, 0x74, 0x02) // PC850

  let align: Align = "left"
  let bold = false
  let big = false
  const setAlign = (a: Align) => { if (a !== align) { align = a; b.push(ESC, 0x61, a === "left" ? 0 : a === "center" ? 1 : 2) } }
  const setBold = (v: boolean) => { if (v !== bold) { bold = v; b.push(ESC, 0x45, v ? 1 : 0) } }
  const setBig = (v: boolean) => { if (v !== big) { big = v; b.push(GS, 0x21, v ? 0x11 : 0x00) } }
  const line = (s: string) => { b.push(...encodeText(s, opts.asciiOnly), LF) }

  for (const op of ops) {
    if (op.t === "text") {
      const w = widthOf(op, opts.cols)
      const indent = Math.min(op.indent ?? 0, Math.max(0, w - 4))
      setBold(!!op.bold); setBig(!!op.big); setAlign(op.align ?? "left")
      wrap(op.text, w - indent).forEach(l => line(" ".repeat(indent) + l))
    } else if (op.t === "row") {
      setBold(!!op.bold); setBig(!!op.big); setAlign("left")
      row(op.left, op.right, widthOf(op, opts.cols)).forEach(line)
    } else if (op.t === "rule") {
      setBold(false); setBig(false); setAlign("left")
      line("-".repeat(opts.cols))
    } else if (op.t === "feed") {
      b.push(ESC, 0x64, Math.min(255, Math.max(0, op.lines)))
    } else if (op.t === "cut") {
      setBold(false); setBig(false); setAlign("left")
      b.push(GS, 0x56, 0x42, 0x00) // avanza y corta (parcial)
    } else if (op.t === "drawer") {
      b.push(ESC, 0x70, 0x00, 0x19, 0xfa) // abre el cajón
    }
  }
  setBold(false); setBig(false); setAlign("left")
  return Uint8Array.from(b.data)
}
