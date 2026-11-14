import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'

import type { RegionDetail, SensorsResponse } from '@/api/types'
import { BigNumber, Card } from '@/components/card'
import { SensorsChart } from '@/components/charts/sensors-chart'

const Y0 = 2002
const Y1 = 2027

function span(from: number, to: number) {
  return {
    left: `${((from - Y0) / (Y1 - Y0)) * 100}%`,
    width: `${((to - from) / (Y1 - Y0)) * 100}%`,
  }
}

/** Two satellites, one record: the timeline and how well they were joined. */
export function Satellites({
  sensors,
  region,
  lastYear,
}: {
  sensors?: SensorsResponse
  region?: RegionDetail
  lastYear: number
}) {
  const ratio = sensors?.ratios.snpp_over_aqua
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <div>
        <p className="eyebrow">04 / Harmonization</p>
        <h2 className="mt-2 text-[34px] leading-[1.05] font-bold tracking-tight sm:text-[40px]">
          Two satellites, <span className="serif">one</span> record
        </h2>
        <p className="text-soft mt-4 max-w-md text-[15px] leading-relaxed">
          MODIS has watched fires since 2000 with ~1 km pixels. VIIRS arrived in 2012 with 375 m
          pixels and detects many more small fires. We use the years when{' '}
          <strong className="text-bone">both were in orbit</strong> to calibrate MODIS and express
          the whole record in a single unit.
        </p>
        <Link
          to="/method"
          className="text-saffron mt-5 inline-flex items-center gap-1.5 text-[14px] font-semibold"
        >
          Read the full methodology <ArrowRight className="size-4" />
        </Link>
      </div>
      <Card className="min-w-0 p-5 sm:p-6">
        <ul className="space-y-4" aria-label="Sensors over time">
          {[
            {
              name: 'MODIS',
              sub: 'Aqua, 1 km',
              from: 2002.5,
              to: lastYear + 1,
              label: 'Jul 2002 →',
              style: 'bg-[#e7ddd2] text-[#100d0f]',
            },
            {
              name: 'VIIRS',
              sub: 'Suomi NPP, NOAA-20, 375 m',
              from: 2012,
              to: lastYear + 1,
              label: 'Feb 2012 →',
              style: 'bg-saffron text-[#100d0f]',
            },
            {
              name: 'Paparajote',
              sub: 'harmonized record',
              from: 2002.5,
              to: lastYear + 1,
              label: `${Y0} → one single unit → today`,
              style: 'bg-gradient-to-r from-coral via-saffron to-[#fbe7a8] text-[#100d0f]',
            },
          ].map((s) => (
            <li
              key={s.name}
              className="grid grid-cols-[96px_1fr] items-center gap-3 sm:grid-cols-[120px_1fr]"
            >
              <div>
                <p className="text-[13px] font-semibold">{s.name}</p>
                <p className="text-mute font-mono text-[10px]">{s.sub}</p>
              </div>
              <div className="relative h-8">
                <span
                  className={`absolute inset-y-0 flex items-center rounded-full px-3 font-mono text-[11px] font-semibold ${s.style}`}
                  style={span(s.from, s.to)}
                >
                  <span className="truncate">{s.label}</span>
                </span>
                {s.name === 'VIIRS' && (
                  <span
                    className="hatch absolute inset-y-0 rounded-full"
                    style={span(2012, 2021.5)}
                    aria-hidden
                    title="Overlap used to learn (2012–2017) and grade (2018–mid 2021)"
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
        <div className="text-mute mt-2 ml-[108px] flex justify-between font-mono text-[10px] sm:ml-[132px]">
          {[2002, 2007, 2012, 2017, 2022, lastYear].map((y) => (
            <span key={y}>{y}</span>
          ))}
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_1.4fr]">
          <p className="bg-card-2 text-soft rounded-[14px] p-4 text-[13px] leading-snug">
            <strong className="text-bone">Overlap (hatched).</strong> 2012–2017 teaches each
            country&apos;s model; 2018 to mid-2021 grades it. The winner rebuilds 2002–2012.
          </p>
          <dl className="bg-card-2 grid grid-cols-3 gap-2 rounded-[14px] p-4 text-center">
            <div>
              <dd>
                <BigNumber className="text-[22px]">
                  {ratio ? `×${ratio.toFixed(1)}` : '–'}
                </BigNumber>
              </dd>
              <dt className="text-mute text-[10px]">VIIRS per MODIS hotspot here</dt>
            </div>
            <div>
              <dd>
                <BigNumber className="text-[22px]">
                  {region?.exam_r2 !== null && region?.exam_r2 !== undefined
                    ? region.exam_r2.toFixed(2)
                    : '–'}
                </BigNumber>
              </dd>
              <dt className="text-mute text-[10px]">exam R², {region?.name ?? 'main country'}</dt>
            </div>
            <div>
              <dd>
                <BigNumber className="text-[22px]">
                  {region?.exam_bias_pct !== null && region?.exam_bias_pct !== undefined
                    ? `${region.exam_bias_pct > 0 ? '+' : '±'}${Math.abs(region.exam_bias_pct).toFixed(0)}%`
                    : '–'}
                </BigNumber>
              </dd>
              <dt className="text-mute text-[10px]">exam bias</dt>
            </div>
          </dl>
        </div>
      </Card>
      {sensors && (
        <Card className="min-w-0 p-5 sm:p-6 lg:col-span-2">
          <h3 className="text-[18px] font-semibold">The switch, before and after</h3>
          <p className="text-soft mt-1 mb-4 text-[13px]">
            Raw yearly hotspots of each satellite in this area, next to the harmonized record.
          </p>
          <SensorsChart data={sensors} />
        </Card>
      )}
    </div>
  )
}
