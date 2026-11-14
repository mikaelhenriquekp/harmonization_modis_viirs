import { useSyncExternalStore } from 'react'

import { getMode, setMode, subscribeMode, type Mode } from '@/lib/mode'

/** Day or night, shared by the whole app. */
export function useMode(): [Mode, (m: Mode) => void] {
  const mode = useSyncExternalStore(subscribeMode, getMode, () => 'night' as const)
  return [mode, setMode]
}
