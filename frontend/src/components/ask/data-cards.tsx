import {
  ArrowUpRight,
  CalendarDays,
  Database,
  MapPinned,
  Radar,
  Satellite,
  ShieldCheck,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import type {
  AnomaliesCardData,
  AssistantCard,
  CalendarCardData,
  HotspotsCardData,
  SensorsCardData,
} from '@/api/types'
import { BigNumber, Delta, Ring } from '@/components/card'
import { formatCount, formatMonth, monthName } from '@/lib/format'
import { ANOMALY_COLOR, heatColor } from '@/lib/heat'
import { STATUS_ORDER, statusMeta, TONE_COLOR } from '@/lib/status'
import { cn } from '@/lib/utils'

import { MiniMap } from './mini-map'

function coords(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(0)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(0)}°${lon >= 0 ? 'E' : 'W'}`
}

function analysisLink(card: AssistantCard, hash: string): string | null {
  if (!card.area) return null
  const p = new URLSearchParams({ area: card.area, name: card.title })
  if (card.from && card.from !== '2002-07') p.set('from', card.from)
  return `/analysis?${p.toString()}#${hash}`
}

function Shell({
  icon,
  kind,
  title,
  link,
  children,
  className,
}: {
  icon: ReactNode
  kind: string
  title: string
  link?: string | null
  children: ReactNode
  className?: string
}) {
  return (
    <article
      className={cn(
        'ember-rise bg-card/80 border-line relative flex min-w-0 flex-col gap-4 overflow-hidden rounded-[20px] border p-4 backdrop-blur-md',
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-16 size-40 rounded-full opacity-60"
        style={{ background: 'radial-gradient(closest-side, rgb(238 143 90 / 0.16), transparent)' }}
      />
      <header className="relative flex items-center gap-2.5">
        <span className="bg-card-2 text-saffron grid size-8 shrink-0 place-items-center rounded-[10px]">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-mute font-mono text-[10px] tracking-[0.16em] uppercase">{kind}</p>
          <h3 className="truncate text-[14.5px] leading-tight font-semibold">{title}</h3>
        </div>
        {link && (
          <Link
            to={link}
            className="text-soft hover:text-saffron hover:bg-saffron-soft grid size-8 place-items-center rounded-full transition-colors"
            aria-label={`Open ${title} in the analysis`}
            title="Open in the analysis"
          >
            <ArrowUpRight className="size-4" />
          </Link>
        )}
      </header>
      <div className="relative">{children}</div>
    </article>
  )
}

function StatusChip({ status }: { status: string }) {
  const meta = statusMeta(status)
  const color = TONE_COLOR[meta.tone]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
      style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ background: color, boxShadow: `0 0 8px ${color}` }}
      />
      {meta.label}
    </span>
  )
}

function CalendarCard({ card }: { card: AssistantCard }) {
  const d = card.data as unknown as CalendarCardData
  const { grid, current } = d
  const n = d.scale?.colors.length ?? 7
  const years = grid?.years ?? []
  const cols = years.length
  return (
    <Shell
      icon={<CalendarDays className="size-4" />}
      kind="Burning calendar"
      title={card.title}
      link={analysisLink(card, 'calendar')}
    >
      {current && (
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-soft text-[12px]">
              {formatMonth(current.month)}
              {current.incomplete ? ' · so far' : ''}
            </p>
            <BigNumber className="text-[30px] leading-none">
              {formatCount(current.hotspots)}
            </BigNumber>
            <p className="text-mute mt-1 text-[11.5px]">
              {current.incomplete && <>≈ {formatCount(current.projected)} projected · </>}
              usual {current.median !== null ? formatCount(current.median) : '—'}{' '}
              <Delta pct={current.anomaly_pct} />
            </p>
          </div>
          <StatusChip status={current.status} />
        </div>
      )}
      {cols > 0 && (
        <div
          role="img"
          aria-label={`Monthly hotspots of ${card.title}, ${years[0]} to ${years[cols - 1]}`}
        >
          <div
            className="grid gap-[2px]"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: 12 }, (_, m) =>
              years.map((y, yi) => {
                const cls = grid.classes[yi]?.[m] ?? -1
                return (
                  <span
                    key={`${y}-${m}`}
                    className="h-[9px] rounded-[2px] transition-transform hover:scale-150"
                    style={{
                      background: cls < 0 ? 'var(--heat-0)' : heatColor(cls, n),
                      opacity: cls < 0 ? 0.35 : 1,
                      animation: `ember-rise .5s ${(yi * 12 + m) * 2}ms both`,
                    }}
                    title={`${monthName(m + 1, 'short')} ${y}: ${grid.values[yi]?.[m] !== null && grid.values[yi]?.[m] !== undefined ? formatCount(grid.values[yi][m] as number) : 'no data'}`}
                  />
                )
              }),
            )}
          </div>
          <div className="text-mute num mt-1.5 flex justify-between font-mono text-[10px]">
            <span>{years[0]}</span>
            {d.peak && (
              <span>
                peak {monthName(d.peak.month_of_year, 'short')} · worst {d.peak.busiest_year}
              </span>
            )}
            <span>{years[cols - 1]}</span>
          </div>
        </div>
      )}
    </Shell>
  )
}

function AnomaliesCard({ card }: { card: AssistantCard }) {
  const d = card.data as unknown as AnomaliesCardData
  const top = d.top ?? []
  const max = Math.max(1, ...top.map((c) => c.projected))
  const total = STATUS_ORDER.reduce((s, k) => s + (d.counts?.[k] ?? 0), 0)
  return (
    <Shell
      icon={<Radar className="size-4" />}
      kind={`Unusual fire · ${formatMonth(d.month, 'short')}`}
      title={card.title}
    >
      <MiniMap
        label={`The most unusual fire in ${card.title}`}
        dots={top.map((c) => ({
          lat: c.lat,
          lon: c.lon,
          weight: Math.sqrt(c.projected / max),
          color: ANOMALY_COLOR[c.status] ?? 'var(--coral)',
          label: `${coords(c.lat, c.lon)}: ${formatCount(c.projected)} projected vs ${c.median !== null ? formatCount(c.median) : '—'} usual`,
        }))}
      />
      {total > 0 && (
        <div className="mt-3 flex h-2 overflow-hidden rounded-full" aria-hidden>
          {STATUS_ORDER.map((k) =>
            d.counts?.[k] ? (
              <span key={k} style={{ flex: d.counts[k], background: ANOMALY_COLOR[k] }} />
            ) : null,
          )}
        </div>
      )}
      <ol className="mt-3 space-y-1.5">
        {top.slice(0, 3).map((c, i) => (
          <li key={`${c.lat},${c.lon}`} className="flex items-center gap-2 text-[12.5px]">
            <span className="bg-saffron text-on-accent grid size-5 shrink-0 place-items-center rounded-full font-mono text-[10px] font-bold">
              {i + 1}
            </span>
            <span className="num font-mono">{coords(c.lat, c.lon)}</span>
            <span className="text-soft ml-auto">
              {formatCount(c.projected)}
              <span className="text-mute">
                {' '}
                vs {c.median !== null ? formatCount(c.median) : '—'}
              </span>
            </span>
            <Delta pct={c.anomaly_pct} />
          </li>
        ))}
      </ol>
    </Shell>
  )
}

function HotspotsCard({ card }: { card: AssistantCard }) {
  const d = card.data as unknown as HotspotsCardData
  const top = d.top ?? []
  const max = Math.max(1, ...top.map((c) => c.hotspots))
  return (
    <Shell
      icon={<MapPinned className="size-4" />}
      kind="Where it burned"
      title={card.title}
      link={analysisLink(card, 'calendar')}
    >
      <div className="mb-3 flex items-end justify-between gap-2">
        <BigNumber className="text-[28px] leading-none">{formatCount(d.total)}</BigNumber>
        <p className="text-mute text-right text-[11.5px]">
          hotspots · {card.from && formatMonth(card.from, 'short')}
          {card.to && card.to !== card.from && ` – ${formatMonth(card.to, 'short')}`}
        </p>
      </div>
      <MiniMap
        label={`Where ${card.title} burned the most`}
        dots={top.map((c) => ({
          lat: c.lat,
          lon: c.lon,
          weight: Math.sqrt(c.hotspots / max),
          color: 'var(--coral)',
          label: `${coords(c.lat, c.lon)}: ${formatCount(c.hotspots)} hotspots`,
        }))}
      />
    </Shell>
  )
}

const SERIES = [
  { key: 'aqua', label: 'MODIS Aqua', color: 'var(--series-aqua)' },
  { key: 'snpp', label: 'VIIRS S-NPP', color: 'var(--series-snpp)' },
  { key: 'harmonized', label: 'Harmonized', color: 'var(--series-harmonized)' },
] as const

function SensorsCard({ card }: { card: AssistantCard }) {
  const d = card.data as unknown as SensorsCardData
  const years = d.years ?? []
  const max = Math.max(1, ...years.flatMap((y) => [y.aqua, y.snpp, y.harmonized]))
  const W = 320
  const H = 110
  const x = (i: number) => (years.length <= 1 ? W / 2 : (i / (years.length - 1)) * W)
  const y = (v: number) => H - (v / max) * (H - 8) - 4
  const ratio = d.ratios?.snpp_over_aqua
  return (
    <Shell
      icon={<Satellite className="size-4" />}
      kind="Satellites compared"
      title={card.title}
      link={analysisLink(card, 'sensors')}
    >
      {ratio && (
        <p className="mb-3 text-[13px]">
          VIIRS sees{' '}
          <span className="text-saffron num font-mono text-[18px] font-semibold">
            ×{ratio.toFixed(1)}
          </span>{' '}
          the hotspots of MODIS
        </p>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Yearly hotspots by satellite"
      >
        {SERIES.map((s) => (
          <polyline
            key={s.key}
            fill="none"
            stroke={s.color}
            strokeWidth={s.key === 'harmonized' ? 2.5 : 1.5}
            strokeLinejoin="round"
            strokeDasharray={s.key === 'harmonized' ? undefined : '3 3'}
            points={years.map((yr, i) => `${x(i)},${y(yr[s.key])}`).join(' ')}
          />
        ))}
      </svg>
      <div className="text-mute mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        {years.length > 0 && (
          <span className="num ml-auto font-mono">
            {years[0].year}–{years[years.length - 1].year}
          </span>
        )}
      </div>
    </Shell>
  )
}

function RegionCard({ card }: { card: AssistantCard }) {
  const d = card.data
  const bias = typeof d.exam_bias_pct === 'number' ? d.exam_bias_pct : null
  const r2 = typeof d.exam_r2 === 'number' ? d.exam_r2 : null
  const good = d.quality === 'good'
  return (
    <Shell icon={<ShieldCheck className="size-4" />} kind="Harmonization" title={card.title}>
      <div className="flex items-center gap-4">
        <Ring
          share={r2 ?? 0}
          color={good ? 'var(--saffron)' : 'var(--coral)'}
          label={`R² ${r2?.toFixed(2) ?? 'unknown'}`}
        />
        <dl className="grid flex-1 grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
          <dt className="text-mute">Model</dt>
          <dd className="truncate font-medium">{String(d.model || '—')}</dd>
          <dt className="text-mute">Scope</dt>
          <dd className="font-medium">{d.scope === 'regional' ? 'Regional pool' : 'Own model'}</dd>
          <dt className="text-mute">Exam bias</dt>
          <dd className="num font-mono">
            {bias !== null ? `${bias > 0 ? '+' : ''}${bias.toFixed(1)}%` : '—'}
          </dd>
          <dt className="text-mute">Quality</dt>
          <dd className={cn('font-semibold', good ? 'text-saffron' : 'text-coral')}>
            {good ? 'Good' : 'To review'}
          </dd>
        </dl>
      </div>
    </Shell>
  )
}

function CoverageCard({ card }: { card: AssistantCard }) {
  const d = card.data as {
    recent_last_day?: string
    data_start?: string
    regions?: { total: number; harmonized: number }
  }
  const share = d.regions && d.regions.total > 0 ? d.regions.harmonized / d.regions.total : 0
  return (
    <Shell icon={<Database className="size-4" />} kind="Data coverage" title={card.title}>
      <div className="flex items-center gap-4">
        <Ring share={share} color="var(--saffron)" label="Countries harmonized" />
        <div className="text-[12.5px]">
          <p>
            <span className="num font-mono font-semibold">{d.regions?.harmonized ?? '—'}</span>
            <span className="text-soft"> of {d.regions?.total ?? '—'} countries harmonized</span>
          </p>
          <p className="text-soft mt-1">
            From {d.data_start ? formatMonth(d.data_start, 'short') : '—'} to{' '}
            <span className="text-bone num font-mono">{d.recent_last_day ?? '—'}</span>
          </p>
        </div>
      </div>
    </Shell>
  )
}

/** The visual of one tool result. */
export function DataCard({ card }: { card: AssistantCard }) {
  switch (card.kind) {
    case 'calendar':
      return <CalendarCard card={card} />
    case 'anomalies':
      return <AnomaliesCard card={card} />
    case 'hotspots':
      return <HotspotsCard card={card} />
    case 'sensors':
      return <SensorsCard card={card} />
    case 'region':
      return <RegionCard card={card} />
    case 'coverage':
      return <CoverageCard card={card} />
    default:
      return null
  }
}

export function DataCards({ cards }: { cards: AssistantCard[] }) {
  if (cards.length === 0) return null
  return (
    <div className={cn('grid gap-3', cards.length > 1 && 'sm:grid-cols-2')}>
      {cards.map((c, i) => (
        <DataCard key={`${c.kind}-${c.title}-${i}`} card={c} />
      ))}
    </div>
  )
}
