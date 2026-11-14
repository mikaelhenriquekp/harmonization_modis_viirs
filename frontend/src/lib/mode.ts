/** Night is the dark interface, day the light one; the detail layer follows the same pass. */
export type Mode = 'night' | 'day'

const KEY = 'fire-atlas-mode'
const listeners = new Set<() => void>()

function read(): Mode {
  try {
    return localStorage.getItem(KEY) === 'day' ? 'day' : 'night'
  } catch {
    return 'night'
  }
}

let mode: Mode = typeof window === 'undefined' ? 'night' : read()

function apply() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.toggle('dark', mode === 'night')
  root.classList.toggle('light', mode === 'day')
}

apply()

export function getMode(): Mode {
  return mode
}

export function setMode(next: Mode) {
  mode = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // private browsing: the choice lasts for this visit only
  }
  apply()
  listeners.forEach((l) => l())
}

export function subscribeMode(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The FIRMS `daynight` letter of the pass a mode stands for. */
export function passOf(m: Mode): 'D' | 'N' {
  return m === 'day' ? 'D' : 'N'
}
