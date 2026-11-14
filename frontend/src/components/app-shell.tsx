import { CalendarDays, Download, Earth, FlaskConical, Info, Satellite, Waves } from 'lucide-react'
import { useEffect, type ComponentType } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'

import head from '@/assets/mascot/head.png'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  /** Section of the analysis page, matched against the URL hash. */
  section?: string
}

/** The rail of the wireframe: the globe, then the sections of the analysis. */
const NAV: NavItem[] = [
  { to: '/', label: 'Globe', icon: Earth },
  { to: '/analysis#calendar', label: 'Calendar', icon: CalendarDays, section: 'calendar' },
  { to: '/analysis#anomalies', label: 'Anomalies', icon: Waves, section: 'anomalies' },
  { to: '/analysis#sensors', label: 'Sensors', icon: Satellite, section: 'sensors' },
  { to: '/analysis#downloads', label: 'Downloads', icon: Download, section: 'downloads' },
  { to: '/method', label: 'Method', icon: FlaskConical },
]

function useActiveKey(): string {
  const { pathname, hash } = useLocation()
  if (pathname === '/analysis') return hash.slice(1) || 'calendar'
  if (pathname === '/method') return 'method'
  if (pathname === '/about') return 'about'
  return pathname === '/' ? 'area' : ''
}

function keyOf(n: NavItem): string {
  return n.section ?? (n.to === '/' ? 'area' : n.to.slice(1))
}

/** Keeps the search (area, period) when moving between views. */
function useSearch(): string {
  return useLocation().search
}

function RailLink({
  item,
  active,
  search,
  compact,
}: {
  item: NavItem
  active: boolean
  search: string
  compact?: boolean
}) {
  const Icon = item.icon
  const [path, hash] = item.to.split('#')
  return (
    <NavLink
      to={{ pathname: path, search, hash: hash ? `#${hash}` : '' }}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex flex-col items-center gap-1',
        compact ? 'min-w-0 flex-1 py-1.5' : 'w-full py-2',
      )}
    >
      <span
        className={cn(
          'grid place-items-center rounded-full transition-colors',
          compact ? 'h-7 w-11' : 'h-8 w-14',
          active ? 'bg-saffron-soft text-saffron' : 'text-soft group-hover:text-bone',
        )}
      >
        <Icon className="size-[18px]" />
      </span>
      <span
        className={cn(
          'text-[11px] leading-none',
          compact && 'text-[10px]',
          active ? 'text-bone font-semibold' : 'text-mute',
        )}
      >
        {item.label}
      </span>
    </NavLink>
  )
}

export function AppShell() {
  const active = useActiveKey()
  const search = useSearch()
  const { pathname, hash } = useLocation()

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
    <div className="min-h-svh md:pl-[88px]">
      <a
        href="#main"
        className="sr-only rounded-md bg-saffron px-3 py-2 text-on-accent focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[1000]"
      >
        Skip to content
      </a>

      <aside
        aria-label="Main"
        className="bg-rail border-line fixed inset-y-0 left-0 z-[600] hidden w-[88px] flex-col items-center border-r py-5 md:flex"
      >
        <NavLink
          to={{ pathname: '/', search }}
          className="mb-6 flex flex-col items-center gap-1"
          aria-label="Paparajote Lunar, home"
        >
          <span className="bg-card-2 grid size-12 place-items-center rounded-[14px]">
            <img src={head} alt="" className="size-10" />
          </span>
          <span className="text-[11px] font-semibold">Paparajote</span>
        </NavLink>
        <nav className="flex w-full flex-col items-center gap-2">
          {NAV.map((n) => (
            <RailLink key={n.label} item={n} active={active === keyOf(n)} search={search} />
          ))}
        </nav>
        <NavLink
          to={{ pathname: '/about', search }}
          className={cn(
            'mt-auto grid size-10 place-items-center rounded-full',
            active === 'about' ? 'bg-saffron-soft text-saffron' : 'text-soft hover:text-bone',
          )}
          aria-label="About"
        >
          <Info className="size-5" />
        </NavLink>
      </aside>

      <main id="main" className="pb-20 md:pb-0">
        <Outlet />
      </main>

      <nav
        aria-label="Main"
        className="bg-rail/95 border-line fixed inset-x-0 bottom-0 z-[600] flex border-t px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {NAV.map((n) => (
          <RailLink key={n.label} item={n} active={active === keyOf(n)} search={search} compact />
        ))}
      </nav>
    </div>
  )
}
