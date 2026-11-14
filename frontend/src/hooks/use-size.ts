import { useLayoutEffect, useRef, useState } from 'react'

/** The width of an element, kept up to date, for responsive SVG charts. */
export function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (el.clientWidth > 0) setWidth(Math.max(240, el.clientWidth)) // measure before the first paint
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) =>
      setWidth(Math.max(240, Math.floor(entry.contentRect.width))),
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}
