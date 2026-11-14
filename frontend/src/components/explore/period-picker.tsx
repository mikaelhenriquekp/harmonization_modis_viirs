import type { MonthRange } from '@/api/calendar'

interface PeriodPickerProps {
  from?: string
  to?: string
  currentYear: number
  onChange: (range: MonthRange) => void
}

const FIRST_YEAR = 2002

/** Choose the period: the whole record, a quick preset or custom years. */
export function PeriodPicker({ from, to, currentYear, onChange }: PeriodPickerProps) {
  const years = Array.from({ length: currentYear - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i)
  const presets = [
    { label: 'Whole record', range: { from: undefined, to: undefined } },
    { label: 'Since VIIRS (2012)', range: { from: '2012-02', to: undefined } },
    { label: 'Last 10 years', range: { from: `${currentYear - 9}-01`, to: undefined } },
  ]
  const fromYear = from ? Number(from.slice(0, 4)) : FIRST_YEAR
  const toYear = to ? Number(to.slice(0, 4)) : currentYear
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <fieldset className="flex flex-wrap gap-1.5">
        <legend className="sr-only">Period</legend>
        {presets.map((p) => (
          <label
            key={p.label}
            className="border-line has-[:checked]:bg-surface-2 has-[:checked]:text-foreground text-muted-foreground cursor-pointer rounded-full border px-3 py-1 has-[:focus-visible]:outline-2"
          >
            <input
              type="radio"
              name="period"
              className="sr-only"
              checked={from === p.range.from && to === p.range.to}
              onChange={() => onChange(p.range)}
            />
            {p.label}
          </label>
        ))}
      </fieldset>
      <span className="text-muted-foreground flex items-center gap-1.5">
        <label htmlFor="period-from">From</label>
        <select
          id="period-from"
          value={fromYear}
          onChange={(e) =>
            onChange({
              from: Number(e.target.value) === FIRST_YEAR ? undefined : `${e.target.value}-01`,
              to,
            })
          }
          className="bg-surface border-line text-foreground rounded-md border px-2 py-1"
        >
          {years
            .filter((y) => y <= toYear)
            .map((y) => (
              <option key={y}>{y}</option>
            ))}
        </select>
        <label htmlFor="period-to">To</label>
        <select
          id="period-to"
          value={toYear}
          onChange={(e) =>
            onChange({
              from,
              to: Number(e.target.value) === currentYear ? undefined : `${e.target.value}-12`,
            })
          }
          className="bg-surface border-line text-foreground rounded-md border px-2 py-1"
        >
          {years
            .filter((y) => y >= fromYear)
            .map((y) => (
              <option key={y}>{y}</option>
            ))}
        </select>
      </span>
    </div>
  )
}
