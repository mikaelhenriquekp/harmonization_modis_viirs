import type { ExamEntry, RegionDetail } from '@/api/types'
import { cn } from '@/lib/utils'

import { JumpTiles } from './jump-tiles'

function n(v: number | null, digits = 1): string {
  return v === null ? '–' : v.toFixed(digits)
}

function ExamTable({
  title,
  entries,
  chosen,
}: {
  title: string
  entries: ExamEntry[]
  chosen?: string
}) {
  return (
    <div className="border-line overflow-x-auto rounded-xl border">
      <table className="tabular w-full min-w-[520px] text-right text-sm">
        <caption className="text-muted-foreground px-3 pt-2 text-left text-xs">{title}</caption>
        <thead className="text-muted-foreground text-xs">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Model
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Bias
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Error per zone and month
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Monthly R²
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const isChosen = e.model === chosen
            return (
              <tr
                key={e.model}
                className={cn(
                  'border-line border-t',
                  isChosen && 'bg-surface-2 font-medium',
                  e.model === 'raw' && 'text-muted-foreground',
                )}
              >
                <th scope="row" className="px-3 py-1.5 text-left font-normal">
                  {e.model === 'raw' ? '' : `${e.model} · `}
                  {e.name}
                  {isChosen && (
                    <span className="text-saffron ml-2 text-xs font-semibold">chosen</span>
                  )}
                </th>
                <td className="px-3 py-1.5">
                  {e.bias_pct === null ? '–' : `${e.bias_pct > 0 ? '+' : ''}${n(e.bias_pct)}%`}
                </td>
                <td className="px-3 py-1.5">{n(e.zone_month_error, 2)}</td>
                <td className="px-3 py-1.5">{n(e.r2_monthly_total, 3)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** How a country was harmonized: the exam of every model and the checks. */
export function RegionExam({ region: r }: { region: RegionDetail }) {
  if (r.status !== 'ok') {
    return (
      <div className="text-sm">
        <h3 className="text-lg font-semibold">{r.name}</h3>
        <p className="text-ink-2 mt-2">No harmonized history: {r.reason ?? 'not ingested yet'}.</p>
        <p className="text-muted-foreground mt-1">
          Its recent VIIRS days are still counted in any area that includes it.
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-5 text-sm">
      <div>
        <h3 className="text-lg font-semibold">{r.name}</h3>
        <p className="text-ink-2 mt-1 leading-relaxed">
          {r.scope === 'regional'
            ? `Too little fire for a model of its own, so it shares one with ${r.pooled_with.map((p) => p.replaceAll('_', ' ')).join(', ')}. `
            : ''}
          Learned on {r.periods.learn[0]} to {r.periods.learn[1]} from{' '}
          {r.train_hotspots.toLocaleString('en')} Aqua hotspots, graded on {r.periods.exam[0]} to{' '}
          {r.periods.exam[1]}, then used to rebuild {r.periods.reconstructed[0]} to{' '}
          {r.periods.reconstructed[1]}.
        </p>
        {r.warnings.length > 0 && (
          <ul className="mt-2 space-y-1">
            {r.warnings.map((w) => (
              <li key={w} className="text-tone-serious">
                {w}
              </li>
            ))}
          </ul>
        )}
      </div>
      {r.jumps && (
        <JumpTiles
          jumps={{
            unharmonized: r.jumps.unharmonized,
            harmonized: r.jumps.harmonized,
            aquaOnly: r.jumps.aqua_only,
          }}
        />
      )}
      {r.exam && (
        <ExamTable
          title="Hotspot models, graded on the exam period"
          entries={r.exam}
          chosen={r.model}
        />
      )}
      {r.energy_exam && (
        <ExamTable
          title="Fire energy (FRP) models"
          entries={r.energy_exam}
          chosen={r.energy_model}
        />
      )}
      {r.handover_noaa20_over_snpp !== null && (
        <p className="text-muted-foreground">
          Suomi NPP to NOAA-20 handover: ×{r.handover_noaa20_over_snpp.toFixed(3)} (×1 means the two
          satellites agree).
        </p>
      )}
    </div>
  )
}
