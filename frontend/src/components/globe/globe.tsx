import { geoGraticule10, geoPath } from 'd3-geo'
import { Flame } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import land110 from 'world-atlas/land-110m.json'

import { makeProjection, pointAt, visible, type Rotation } from '@/lib/globe'
import { cn } from '@/lib/utils'

const LAND = feature(
  land110 as unknown as Topology,
  (land110 as unknown as Topology).objects.land as GeometryCollection,
)
const GRATICULE = geoGraticule10()

export interface GlobePin {
  id: string
  lat: number
  lon: number
  color: string
  label: string
}

interface GlobeProps {
  /** [lat, lon, hotspots] cells of this month. */
  fire: [number, number, number][]
  maxFire: number
  pins: GlobePin[]
  marker?: { lat: number; lon: number } | null
  onPick: (lat: number, lon: number) => void
  /** Increment to drop the fire at the center of the current view. */
  dropCenter?: number
  children?: ReactNode
  className?: string
}

const FIRE_COLORS = ['#6e2536', '#c23b54', '#e0623f', '#ee8f5a']

/** A speckled bone texture for land, like the wireframe's. */
function landPattern(ctx: CanvasRenderingContext2D): CanvasPattern | string {
  const c = document.createElement('canvas')
  c.width = c.height = 96
  const t = c.getContext('2d')
  if (!t) return '#d8cec2'
  t.fillStyle = '#d6ccbf'
  t.fillRect(0, 0, 96, 96)
  for (let i = 0; i < 420; i++) {
    t.fillStyle = Math.random() < 0.5 ? 'rgba(80,60,50,0.28)' : 'rgba(255,250,240,0.35)'
    t.fillRect(Math.random() * 96, Math.random() * 96, 1.2, 1.2)
  }
  return ctx.createPattern(c, 'repeat') ?? '#d8cec2'
}

function reducedMotion(): boolean {
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** The globe: land, this month's fire, pins, and a dropped fire marker. */
export function Globe({
  fire,
  maxFire,
  pins,
  marker,
  onPick,
  dropCenter = 0,
  children,
  className,
}: GlobeProps) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState(480)
  const [rotate, setRotate] = useState<Rotation>([-10, -25])
  const drag = useRef<{ x: number; y: number; r: Rotation; moved: boolean } | null>(null)
  const spinning = useRef(!marker)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const measure = () =>
      setSize(
        Math.max(260, Math.floor(Math.min(el.clientWidth, el.clientHeight || el.clientWidth))),
      )
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // drop the fire where the reader is looking
  const rotateRef = useRef(rotate)
  rotateRef.current = rotate
  useEffect(() => {
    if (dropCenter > 0) {
      spinning.current = false
      onPick(-rotateRef.current[1], ((-rotateRef.current[0] + 540) % 360) - 180)
    }
    // only when asked, not when the callback changes
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [dropCenter])

  // a slow spin until the reader touches the globe
  useEffect(() => {
    if (reducedMotion()) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      if (spinning.current && !drag.current) setRotate((r) => [r[0] + (now - last) * 0.004, r[1]])
      last = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const projection = useMemo(() => makeProjection(size, rotate), [size, rotate])
  const pattern = useRef<CanvasPattern | string | null>(null)

  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const dpr = window.devicePixelRatio || 1
    c.width = size * dpr
    c.height = size * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)
    pattern.current ??= landPattern(ctx)
    const path = geoPath(projection, ctx)
    const r = size / 2

    // ocean with a soft shading, lit from the upper left
    const shade = ctx.createRadialGradient(r * 0.7, r * 0.6, r * 0.1, r, r, r)
    shade.addColorStop(0, '#3a3236')
    shade.addColorStop(1, '#141013')
    ctx.beginPath()
    path({ type: 'Sphere' })
    ctx.fillStyle = shade
    ctx.fill()

    ctx.beginPath()
    path(GRATICULE)
    ctx.strokeStyle = 'rgba(242,236,228,0.05)'
    ctx.lineWidth = 0.6
    ctx.stroke()

    ctx.beginPath()
    path(LAND)
    ctx.fillStyle = pattern.current
    ctx.fill()

    // fire: only where it matters, bigger and hotter where there is more
    for (const [lat, lon, h] of fire) {
      const k = Math.sqrt(h / Math.max(maxFire, 1))
      if (k < 0.06 || !visible([lon, lat], rotate)) continue
      const xy = projection([lon, lat])
      if (!xy) continue
      ctx.fillStyle =
        FIRE_COLORS[Math.min(FIRE_COLORS.length - 1, Math.floor(k * FIRE_COLORS.length))]
      ctx.globalAlpha = 0.55 + 0.4 * k
      ctx.beginPath()
      ctx.arc(xy[0], xy[1], 1.4 + 4 * k, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // terminator-like shading on the right edge
    const edge = ctx.createRadialGradient(r * 0.8, r * 0.75, r * 0.6, r, r, r * 1.02)
    edge.addColorStop(0, 'rgba(16,13,15,0)')
    edge.addColorStop(1, 'rgba(16,13,15,0.55)')
    ctx.beginPath()
    path({ type: 'Sphere' })
    ctx.fillStyle = edge
    ctx.fill()
  }, [projection, fire, maxFire, rotate, size])

  const place = (lat: number, lon: number) => {
    if (!visible([lon, lat], rotate)) return null
    const xy = projection([lon, lat])
    return xy ? { left: xy[0], top: xy[1] } : null
  }

  const markerPos = marker ? place(marker.lat, marker.lon) : null

  return (
    <div ref={wrap} className={cn('relative grid place-items-center', className)}>
      <div
        className="relative touch-none select-none"
        style={{ width: size, height: size }}
        onPointerDown={(e) => {
          spinning.current = false
          drag.current = { x: e.clientX, y: e.clientY, r: rotate, moved: false }
          ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          const dx = e.clientX - d.x
          const dy = e.clientY - d.y
          if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true
          const k = 120 / size
          setRotate([d.r[0] + dx * k, Math.max(-70, Math.min(70, d.r[1] - dy * k))])
        }}
        onPointerUp={(e) => {
          const d = drag.current
          drag.current = null
          if (d && !d.moved) {
            const box = e.currentTarget.getBoundingClientRect()
            const ll = pointAt(projection, [e.clientX - box.left, e.clientY - box.top])
            if (ll) onPick(ll[1], ll[0])
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const box = e.currentTarget.getBoundingClientRect()
          const ll = pointAt(projection, [e.clientX - box.left, e.clientY - box.top])
          if (ll) onPick(ll[1], ll[0])
        }}
        aria-label="Globe with this month's fire. Drag to turn it; tap a place to drop the fire there."
        role="application"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-[6%] rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(240,192,72,0.16) 55%, rgba(240,192,72,0) 70%)',
          }}
        />
        <canvas
          ref={canvas}
          className="relative size-full cursor-grab active:cursor-grabbing"
          style={{ width: size, height: size }}
        />
        {pins.map((p) => {
          const pos = place(p.lat, p.lon)
          if (!pos) return null
          return (
            <button
              key={p.id}
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onPick(p.lat, p.lon)}
              className="absolute -translate-x-1/2 -translate-y-full"
              style={{ left: pos.left, top: pos.top - 6, color: p.color }}
              aria-label={p.label}
              title={p.label}
            >
              <span className="ring-ping" style={{ top: 'calc(100% + 6px)' }} />
              <span
                className="relative grid size-11 place-items-center rounded-[14px] border-2 border-[#100d0f]"
                style={{ background: p.color }}
              >
                <Flame className="size-5 text-[#100d0f]" fill="currentColor" />
              </span>
            </button>
          )
        })}
        {markerPos && (
          <span
            aria-hidden
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: markerPos.left, top: markerPos.top, color: 'var(--saffron)' }}
          >
            <span className="ring-ping" />
            <span className="ring-ping" style={{ animationDelay: '1.2s' }} />
            <span className="block size-4 rounded-full border-2 border-[#100d0f] bg-[var(--saffron)]" />
          </span>
        )}
        {children}
      </div>
    </div>
  )
}
