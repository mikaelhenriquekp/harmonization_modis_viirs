import type { ReactNode } from 'react'

import { ThemeContext, useThemeState } from '@/hooks/use-theme'

export function ThemeProvider({ children }: { children: ReactNode }) {
  return <ThemeContext.Provider value={useThemeState()}>{children}</ThemeContext.Provider>
}
