import {
  CalendarDays,
  FlaskConical,
  Globe2,
  History,
  Info,
  LayoutDashboard,
  Moon,
  Sun,
} from 'lucide-react'
import { useEffect, type ComponentType } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'

import head from '@/assets/mascot/head.png'
import { Guide } from '@/components/guide/guide'
import { useMode } from '@/hooks/use-mode'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/compare', label: 'Time machine', icon: History },
  { to: '/analysis', label: 'Analysis', icon: CalendarDays },
  { to: '/globe', label: 'Globe', icon: Globe2 },
  { to: '/method', label: 'Method', icon: FlaskConical },
  { to: '/about', label: 'About', icon: Info },
]

/** Night and day: the theme, and the satellite pass the 375 m layer shows. */
function ModeSwitch() {
  const [mode, setMode] = useMode()
  return (
    <div
      role="group"
      aria-label="Day or night mode"
      className="border-line flex shrink-0 rounded-full border p-0.5"
    >
      {(
        [
          ['day', 'Day', Sun],
          ['night', 'Night', Moon],
        ] as const
      ).map(([value, label, Icon]) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          onClick={() => setMode(value)}
          title={`${label} mode: ${value === 'day' ? 'light' : 'dark'} theme and ${value} passes on the 375 m layer`}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold',
            mode === value ? 'bg-saffron text-[#100d0f]' : 'text-soft hover:text-bone',
          )}
        >
          <Icon className="size-4" />
          <span className="hidden sm:inline">{label}</span>
          <span className="sr-only sm:hidden">{label}</span>
        </button>
      ))}
    </div>
  )
}

export function AppShell() {
  // keeps the place and the period when moving between views
  const { pathname, hash, search } = useLocation()

  // links to a section scroll to it
  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0 })
      return
    }
    const el = document.getElementById(hash.slice(1))
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [pathname, hash])

  return (
    <div className="min-h-svh">
      <a
        href="#main"
        className="sr-only rounded-md bg-saffron px-3 py-2 text-[#100d0f] focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[1000]"
      >
        Skip to content
      </a>

      <header className="bg-rail border-line border-b">
        <div className="mx-auto flex max-w-[1720px] items-center gap-3 px-3 py-2 sm:px-5">
          <NavLink
            to={{ pathname: '/', search }}
            className="flex shrink-0 items-center gap-2.5"
            aria-label="Fire Atlas by Paparajote Lunar, dashboard"
          >
            <span className="bg-card-2 grid size-10 place-items-center rounded-[12px]">
              <img src={head} alt="" className="size-8" />
            </span>
            <span className="hidden leading-none sm:block">
              <span className="block text-[15px] font-bold tracking-[0.08em]">FIRE ATLAS</span>
              <span className="text-mute mt-1 block font-mono text-[10px] tracking-[0.06em] uppercase">
                Paparajote Lunar
              </span>
            </span>
          </NavLink>
          <nav aria-label="Main" className="flex min-w-0 flex-1 gap-1 overflow-x-auto sm:ml-4">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={{ pathname: to, search }}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] whitespace-nowrap transition-colors',
                    isActive
                      ? 'bg-saffron-soft text-saffron font-semibold'
                      : 'text-soft hover:text-bone',
                  )
                }
              >
                <Icon className="size-4" />
                {label}
              </NavLink>
            ))}
          </nav>
          <ModeSwitch />
        </div>
      </header>

      <main id="main" className="pb-20">
        <Outlet />
      </main>

      <Guide />
    </div>
  )
}
