import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

const PRESETS = [
  '#18181b',
  '#4f46e5',
  '#2563eb',
  '#0891b2',
  '#059669',
  '#65a30d',
  '#d97706',
  '#dc2626',
  '#db2777',
  '#9333ea',
]

const FALLBACK_HEX = '#18181b'
const HEX_RE = /^#[0-9a-fA-F]{6}$/
const PARTIAL_RE = /^#?[0-9a-fA-F]{0,6}$/

interface Hsv {
  h: number
  s: number
  v: number
}

function normalizeHex(raw: string): string | null {
  const body = raw.replace(/^#/, '')
  return /^[0-9a-fA-F]{6}$/.test(body) ? `#${body.toLowerCase()}` : null
}

function HexInput({
  value,
  onChange,
  className,
  ariaLabel,
}: {
  value: string
  onChange: (hex: string) => void
  className: string
  ariaLabel?: string
}) {
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState(value)
  const lastValidRef = useRef(HEX_RE.test(value) ? value : FALLBACK_HEX)

  useEffect(() => {
    if (HEX_RE.test(value)) lastValidRef.current = value
  }, [value])

  useEffect(() => {
    if (!focused) setDraft(value)
  }, [value, focused])

  function handleChange(raw: string) {
    if (!PARTIAL_RE.test(raw)) return
    setDraft(raw)
    const normalized = normalizeHex(raw)
    if (normalized) onChange(normalized)
  }

  function handleBlur() {
    setFocused(false)
    if (!normalizeHex(draft)) setDraft(lastValidRef.current)
  }

  return (
    <input
      type="text"
      aria-label={ariaLabel}
      value={draft.toUpperCase()}
      onChange={(e) => handleChange(e.target.value.trim())}
      onFocus={() => {
        setFocused(true)
        setDraft(value)
      }}
      onBlur={handleBlur}
      maxLength={7}
      spellCheck={false}
      className={className}
    />
  )
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

export function hexToHsv(hex: string): Hsv {
  const m = hex.replace('#', '')
  const full =
    m.length === 3
      ? m
          .split('')
          .map((c) => c + c)
          .join('')
      : m.padEnd(6, '0')
  const r = Number.parseInt(full.slice(0, 2), 16) / 255
  const g = Number.parseInt(full.slice(2, 4), 16) / 255
  const b = Number.parseInt(full.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const c = v * s
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let rgb: [number, number, number] = [0, 0, 0]
  if (hp >= 0 && hp < 1) rgb = [c, x, 0]
  else if (hp < 2) rgb = [x, c, 0]
  else if (hp < 3) rgb = [0, c, x]
  else if (hp < 4) rgb = [0, x, c]
  else if (hp < 5) rgb = [x, 0, c]
  else rgb = [c, 0, x]
  const m = v - c
  const hex = rgb
    .map((n) =>
      Math.round((n + m) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
  return `#${hex}`
}

interface ColorFieldProps {
  value: string
  onChange: (hex: string) => void
}

export function ColorField({ value, onChange }: ColorFieldProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)
  const hsv = useMemo(() => hexToHsv(value), [value])

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  function commit(next: Hsv) {
    onChange(hsvToHex(next))
  }

  function applyFromEvent(e: React.PointerEvent, kind: 'area' | 'hue') {
    const el = kind === 'area' ? areaRef.current : hueRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (kind === 'area') {
      const s = clamp01((e.clientX - r.left) / r.width)
      const v = 1 - clamp01((e.clientY - r.top) / r.height)
      commit({ h: hsv.h, s, v })
    } else {
      const h = clamp01((e.clientX - r.left) / r.width) * 360
      commit({ h, s: hsv.s || 1, v: hsv.v || 1 })
    }
  }

  function pointerHandlers(kind: 'area' | 'hue') {
    return {
      onPointerDown: (e: React.PointerEvent) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        applyFromEvent(e, kind)
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (e.buttons & 1) applyFromEvent(e, kind)
      },
    }
  }

  return (
    <div className="relative" ref={rootRef}>
      <div
        className={`flex h-9 w-full items-center gap-2.5 rounded-md border px-2.5 transition-[border-color,background-color,box-shadow] duration-150 focus-within:border-ring focus-within:bg-background focus-within:ring-[3px] focus-within:ring-ring/15 ${
          open ? 'border-ring bg-background ring-[3px] ring-ring/15' : 'border-input bg-muted/30'
        }`}
      >
        <span
          className="size-5 shrink-0 rounded-[5px] border border-black/15 dark:border-white/25"
          style={{ backgroundColor: value }}
        />
        <HexInput
          value={value}
          onChange={onChange}
          ariaLabel="Brand color hex"
          className="flex-1 bg-transparent font-mono text-xs uppercase tracking-wide outline-none"
        />
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ChevronDown
            className={`size-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {open && (
        <div className="absolute z-20 mt-1.5 w-[264px] rounded-lg border bg-popover p-3 shadow-lg">
          <div
            ref={areaRef}
            role="application"
            aria-label="Saturation and brightness"
            className="relative h-36 cursor-crosshair touch-none rounded-md"
            {...pointerHandlers('area')}
            style={{
              background: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0)), hsl(${hsv.h} 100% 50%)`,
            }}
          >
            <span
              className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md"
              style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
            />
          </div>

          <div
            ref={hueRef}
            role="slider"
            aria-label="Hue"
            aria-valuenow={Math.round(hsv.h)}
            aria-valuemin={0}
            aria-valuemax={360}
            tabIndex={0}
            className="relative mt-3 h-3 cursor-pointer touch-none rounded-full"
            {...pointerHandlers('hue')}
            style={{
              background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
            }}
          >
            <span
              className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md"
              style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
            />
          </div>

          <div className="mt-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Presets
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-label={`Use ${preset}`}
                  onClick={() => onChange(preset)}
                  className="grid size-6 place-items-center rounded-md border border-black/10 transition-transform duration-150 hover:scale-110 dark:border-white/20"
                  style={{ backgroundColor: preset }}
                >
                  {preset.toLowerCase() === value.toLowerCase() && (
                    <Check className="size-3.5 text-white mix-blend-difference" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Hex
            </span>
            <HexInput
              value={value}
              onChange={onChange}
              ariaLabel="Hex"
              className="mt-1 h-8 w-full rounded-md border border-input bg-muted/30 px-2.5 font-mono text-xs uppercase outline-none transition-colors duration-150 focus-visible:border-ring focus-visible:bg-background"
            />
          </div>
        </div>
      )}
    </div>
  )
}
