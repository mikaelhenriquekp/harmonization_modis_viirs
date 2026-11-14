import type { Jumps } from '@/lib/jumps'

function fmt(v: number | null): string {
  return v === null ? '–' : `×${v.toFixed(2)}`
}

const TILES = [
  {
    key: 'unharmonized',
    title: 'Raw record',
    text: 'MODIS until 2011, VIIRS after: the switch alone multiplies the count.',
  },
  { key: 'harmonized', title: 'Harmonized', text: 'The same years after harmonizing.' },
  {
    key: 'aquaOnly',
    title: 'Aqua alone',
    text: 'One sensor throughout: what a real change looks like.',
  },
] as const

/**
 * The step at the 2012 sensor switch: mean yearly hotspots of 2012–2014 over
 * 2009–2011. Harmonized should match Aqua alone, not the raw record.
 */
export function JumpTiles({ jumps }: { jumps: Jumps }) {
  const max = Math.max(1.2, ...Object.values(jumps).map((v) => v ?? 0))
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {TILES.map((t) => {
        const v = jumps[t.key]
        return (
          <div key={t.key} className="border-line rounded-xl border p-4">
            <p className="text-sm font-medium">{t.title}</p>
            <p className="tabular mt-1 text-4xl font-semibold tracking-tight">{fmt(v)}</p>
            <div className="bg-surface-2 relative mt-3 h-2 rounded-full" aria-hidden>
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${Math.min(100, ((v ?? 0) / max) * 100)}%`,
                  background:
                    t.key === 'unharmonized'
                      ? 'var(--series-aqua)'
                      : t.key === 'harmonized'
                        ? 'var(--series-harmonized)'
                        : 'var(--ink-2)',
                }}
              />
              <div
                className="bg-foreground absolute -inset-y-1 w-0.5"
                style={{ left: `${(1 / max) * 100}%` }}
                title="×1, no step"
              />
            </div>
            <p className="text-muted-foreground mt-3 text-xs leading-relaxed">{t.text}</p>
          </div>
        )
      })}
    </div>
  )
}
