"use client"

import { useEffect, useRef, useState } from "react"

export type BarDatum = { label: string; value: number }

type Props = {
  data: BarDatum[]
  format: (value: number) => string
  ariaLabel: string
}

// escala de 2, 4, 6, 8 o 10 por una potencia de 10: así la mitad del eje siempre es un número limpio
const niceMax = (v: number): number => {
  if (v <= 0) return 2
  const exp = Math.pow(10, Math.floor(Math.log10(v)))
  const f = v / exp
  const nice = f <= 2 ? 2 : f <= 4 ? 4 : f <= 6 ? 6 : f <= 8 ? 8 : 10
  return nice * exp
}

const H = 230
const PAD_TOP = 26
const PAD_BOTTOM = 30
const PAD_RIGHT = 8

// Barras a escala. Se dibuja al ancho real para que el texto no se encoja en el celular;
// la última barra (el día más reciente) va en naranja.
export default function BarChart({ data, format, ariaLabel }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      const w = Math.round(entries[0].contentRect.width)
      if (w > 0) setWidth(w)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const max = niceMax(Math.max(...data.map(d => d.value), 0))
  const ticks = [0, max / 2, max]
  const padLeft = Math.max(44, Math.max(...ticks.map(t => format(t).length)) * 7 + 14)
  const innerW = width - padLeft - PAD_RIGHT
  const innerH = H - PAD_TOP - PAD_BOTTOM
  const slot = innerW / Math.max(data.length, 1)
  const barW = Math.min(slot * 0.62, 44)
  const labelEvery = Math.max(1, Math.ceil(46 / slot))
  const y = (v: number) => PAD_TOP + innerH - (v / max) * innerH

  return (
    <div ref={wrapRef} className="w-full">
      <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label={ariaLabel} className="block max-w-full">
        {ticks.map(t => (
          <g key={t}>
            <line x1={padLeft} x2={width - PAD_RIGHT} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={padLeft - 8} y={y(t) + 4} textAnchor="end" fill="var(--color-soft)" fontSize={12}>
              {format(t)}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const isLast = i === data.length - 1
          const h = Math.max((d.value / max) * innerH, d.value > 0 ? 2 : 0)
          const x = padLeft + slot * i + (slot - barW) / 2
          const showValue = d.value > 0 && (isLast || active === i)
          // se cuentan desde el último día para que ese siempre tenga rótulo
          const showLabel = (data.length - 1 - i) % labelEvery === 0
          return (
            <g
              key={i}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onClick={() => setActive(a => (a === i ? null : i))}
            >
              <title>{`${d.label}: ${format(d.value)}`}</title>
              {/* zona de toque más ancha que la barra */}
              <rect x={padLeft + slot * i} y={PAD_TOP} width={slot} height={innerH} fill="transparent" />
              <rect
                x={x}
                y={y(d.value)}
                width={barW}
                height={h}
                rx={3}
                fill={isLast ? "var(--color-hot)" : "var(--color-brand)"}
                fillOpacity={isLast ? 1 : active === i ? 0.7 : 0.4}
              />
              {showValue && (
                <text x={Math.min(Math.max(x + barW / 2, padLeft + 20), width - PAD_RIGHT - 24)} y={y(d.value) - 7} textAnchor="middle" fill="var(--color-ink)" fontSize={12} fontWeight={700}>
                  {format(d.value)}
                </text>
              )}
              {showLabel && (
                <text
                  x={x + barW / 2}
                  y={H - 9}
                  textAnchor="middle"
                  fill={isLast ? "var(--color-ink)" : "var(--color-soft)"}
                  fontSize={12}
                  fontWeight={isLast ? 700 : 500}
                >
                  {d.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
