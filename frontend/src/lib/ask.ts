import type { PageContext } from '@/api/types'

import { areaToSearch, type Area } from './area'
import { formatMonth } from './format'

export interface ToolMeta {
  /** While running: "Reading the burning calendar". */
  active: string
  /** Once done: "Burning calendar". */
  done: string
}

const TOOLS: Record<string, ToolMeta> = {
  get_calendar: { active: 'Reading the burning calendar', done: 'Burning calendar' },
  get_anomalies: { active: 'Scanning for unusual fire', done: 'Anomaly scan' },
  get_fire_map: { active: 'Mapping the hotspots', done: 'Hotspot map' },
  get_sensors: { active: 'Comparing the satellites', done: 'Satellite comparison' },
  find_region: { active: 'Locating the place', done: 'Place found' },
  get_region: { active: 'Checking the harmonization', done: 'Harmonization check' },
  get_coverage: { active: 'Checking how fresh the data is', done: 'Data coverage' },
}

export function toolMeta(name: string): ToolMeta {
  return TOOLS[name] ?? { active: `Running ${name}`, done: name }
}

function month(m: unknown): string | null {
  return typeof m === 'string' && /^\d{4}-\d{2}$/.test(m) ? formatMonth(m, 'short') : null
}

/** "Iberian Peninsula · Jan 2020 – now" from a tool call's arguments. */
export function describeArgs(args: Record<string, unknown> | undefined): string {
  if (!args) return ''
  const parts: string[] = []
  const area = args.area as { kind?: string; name?: string } | undefined
  if (area?.name) parts.push(area.name)
  else if (area?.kind === 'world' || (!area && ('from' in args || 'month' in args)))
    parts.push('World')
  if (typeof args.query === 'string') parts.push(`“${args.query}”`)
  if (typeof args.id === 'string') parts.push(args.id)
  const from = month(args.from)
  const to = month(args.to)
  if (from || to) parts.push(`${from ?? 'Jul 2002'} – ${to ?? 'now'}`)
  const m = month(args.month)
  if (m) parts.push(m)
  return parts.join(' · ')
}

export type SuggestionIcon = 'globe' | 'flame' | 'trees' | 'calendar' | 'satellite' | 'compare'

export interface Suggestion {
  icon: SuggestionIcon
  title: string
  question: string
}

/** Questions that show what Ember can do, for the empty state. */
export const SUGGESTIONS: Suggestion[] = [
  {
    icon: 'globe',
    title: 'Where is fire unusual right now?',
    question: 'Where on Earth is fire most unusual right now, compared with past years?',
  },
  {
    icon: 'flame',
    title: 'Is Greece burning more than usual?',
    question: 'Is Greece burning more than usual this year?',
  },
  {
    icon: 'trees',
    title: 'Amazon: this year vs the worst years',
    question:
      'How does fire in the Brazilian Amazon this year compare with its worst years on record?',
  },
  {
    icon: 'calendar',
    title: 'When is fire season in Iberia?',
    question: 'When is the fire season in the Iberian Peninsula, and what was its worst year?',
  },
  {
    icon: 'satellite',
    title: 'Why harmonize MODIS and VIIRS?',
    question:
      'Why does the raw satellite record jump in 2012, and how does Ctrl + Fire harmonize MODIS and VIIRS?',
  },
  {
    icon: 'compare',
    title: 'Australia vs Africa this month',
    question: 'Compare fire activity this month in Australia and in southern Africa.',
  },
]

/** The chat's link from a page that shows an area and a period. */
export function askLink(
  ctx: { area?: Area; name?: string; from?: string; to?: string },
  question?: string,
): string {
  const p = new URLSearchParams()
  if (ctx.area) p.set('area', areaToSearch(ctx.area))
  if (ctx.name) p.set('name', ctx.name)
  if (ctx.from) p.set('from', ctx.from)
  if (ctx.to) p.set('to', ctx.to)
  if (question) p.set('q', question)
  const s = p.toString()
  return s ? `/ask?${s}` : '/ask'
}

/** What the chat was opened about, from its URL. */
export function contextFromSearch(params: URLSearchParams): PageContext | undefined {
  const ctx: PageContext = {}
  const area = params.get('area')
  if (area) ctx.area = area
  const name = params.get('name')
  if (name) ctx.name = name
  for (const k of ['from', 'to'] as const) {
    const v = params.get(k)
    if (v && /^\d{4}-\d{2}$/.test(v)) ctx[k] = v
  }
  return Object.keys(ctx).length > 0 ? ctx : undefined
}

/** "Iberian Peninsula · 2020 – now". */
export function describeContext(ctx: PageContext): string {
  const name = ctx.name ?? (ctx.area === 'world' ? 'World' : 'Your area')
  if (!ctx.from && !ctx.to) return name
  return `${name} · ${month(ctx.from) ?? 'Jul 2002'} – ${month(ctx.to) ?? 'now'}`
}
