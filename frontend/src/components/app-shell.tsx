import { Moon, Sun } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'

import head from '@/assets/mascot/head.png'
import { useCoverage } from '@/hooks/use-fire'
import { useTheme } from '@/hooks/use-theme'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/', label: 'Explore', end: true },
  { to: '/validation', label: 'Validation' },
  { to: '/about', label: 'About' },
]

export const ATTRIBUTION =
  "We acknowledge the use of data and/or imagery from NASA's Fire Information for Resource Management System (FIRMS), part of NASA's Land, Atmosphere Near real-time Capability for Earth observations (LANCE) and NASA's Earth Science Data and Information System (ESDIS)."

export function AppShell() {
  const { theme, toggle } = useTheme()
  const coverage = useCoverage()
  return (
    <div className="flex min-h-svh flex-col">
      <a
        href="#main"
        className="bg-gold text-[#03133f] sr-only rounded-md px-3 py-2 focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[1000]"
      >
        Skip to content
      </a>
      <header className="border-line bg-background/90 sticky top-0 z-[500] border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-2 px-3 sm:gap-3 sm:px-6">
          <NavLink
            to="/"
            className="flex shrink-0 items-center gap-2"
            aria-label="Paparajote Lunar, home"
          >
            <img src={head} alt="" width={36} height={36} className="size-9" />
            <span className="hidden text-[17px] font-semibold tracking-tight sm:inline">
              Paparajote Lunar
            </span>
          </NavLink>
          <nav aria-label="Main" className="ml-auto flex items-center gap-0.5 sm:ml-6 sm:gap-1">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-full px-2.5 py-1.5 text-sm transition-colors sm:px-3',
                    isActive
                      ? 'bg-surface-2 text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <button
            type="button"
            onClick={toggle}
            className="text-muted-foreground hover:text-foreground hover:bg-surface-2 ml-1 grid size-9 place-items-center rounded-full sm:ml-auto"
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
          </button>
        </div>
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <footer className="border-line text-muted-foreground border-t">
        <div className="mx-auto grid max-w-[1440px] gap-2 px-4 py-6 text-xs leading-relaxed sm:px-6 md:grid-cols-[1fr_auto] md:gap-8">
          <p className="max-w-3xl">{ATTRIBUTION}</p>
          <p className="tabular md:text-right">
            {coverage.data?.recent_last_day ? (
              <>Data up to {coverage.data.recent_last_day}</>
            ) : null}
            <br />
            NASA Space Apps Challenge 2026 · Paparajote Lunar
          </p>
        </div>
      </footer>
    </div>
  )
}
