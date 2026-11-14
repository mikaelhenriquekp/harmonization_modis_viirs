import { useEffect, useRef } from 'react'

import type { Phase } from '@/hooks/use-assistant'
import { cn } from '@/lib/utils'

/** How hot the field burns in each phase: speed, spawn rate, glow. */
const HEAT: Record<Phase, number> = { idle: 0.35, thinking: 0.8, working: 1, speaking: 0.65 }

const COLORS = ['240,192,72', '238,143,90', '194,59,84', '251,231,168']

interface Ember {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  life: number
  max: number
  c: string
  wobble: number
}

function reducedMotion(): boolean {
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/**
 * Embers rising from the bottom of the page, hotter and faster while Ember
 * works. Pure decoration: hidden from assistive tech, still under reduced
 * motion.
 */
export function EmberField({ phase, className }: { phase: Phase; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const heat = useRef(HEAT[phase])
  const target = useRef(HEAT[phase])
  useEffect(() => {
    target.current = HEAT[phase]
  }, [phase])

  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    let w = 0
    let h = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = () => {
      w = el.clientWidth
      h = el.clientHeight
      el.width = w * dpr
      el.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)

    const embers: Ember[] = []
    const spawn = (anywhere = false): Ember => {
      const max = 4 + Math.random() * 6
      return {
        x: Math.random() * w,
        y: anywhere ? Math.random() * h : h + 10,
        vx: (Math.random() - 0.5) * 12,
        vy: -(18 + Math.random() * 42),
        r: 0.6 + Math.random() * 2.2,
        life: anywhere ? Math.random() * max : 0,
        max,
        c: COLORS[(Math.random() * COLORS.length) | 0],
        wobble: Math.random() * Math.PI * 2,
      }
    }
    const count = () => Math.round(Math.min(140, (w * h) / 9000))
    for (let i = 0; i < count(); i++) embers.push(spawn(true))

    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'lighter'
      for (const e of embers) {
        const t = e.life / e.max
        const alpha = Math.sin(Math.PI * Math.min(1, t)) * (0.35 + heat.current * 0.6)
        const r = e.r * (1 + heat.current * 0.6)
        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r * 5)
        g.addColorStop(0, `rgba(${e.c},${alpha})`)
        g.addColorStop(0.25, `rgba(${e.c},${alpha * 0.35})`)
        g.addColorStop(1, `rgba(${e.c},0)`)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(e.x, e.y, r * 5, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'
    }

    if (reducedMotion()) {
      draw()
      return () => ro.disconnect()
    }

    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      heat.current += (target.current - heat.current) * Math.min(1, dt * 2)
      const speed = 0.6 + heat.current * 1.6
      for (let i = 0; i < embers.length; i++) {
        const e = embers[i]
        e.life += dt * speed
        e.wobble += dt * 2
        e.x += (e.vx + Math.sin(e.wobble) * 8) * dt * speed
        e.y += e.vy * dt * speed
        if (e.life > e.max || e.y < -20) embers[i] = spawn()
      }
      const want = Math.round(count() * (0.6 + heat.current * 0.6))
      while (embers.length < want) embers.push(spawn())
      if (embers.length > want) embers.length = want
      draw()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={canvas}
      aria-hidden
      className={cn('pointer-events-none fixed inset-0 size-full', className)}
    />
  )
}
