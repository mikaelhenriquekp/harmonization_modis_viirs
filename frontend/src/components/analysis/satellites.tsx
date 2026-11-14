import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'

import type { RegionDetail, SensorsResponse } from '@/api/types'
import { BigNumber, Card } from '@/components/card'
import { SensorsChart } from '@/components/charts/sensors-chart'
import { formatSignedPct } from '@/lib/format'

const Y0 = 2002
const Y1 = 2027

function span(from: number, to: number) {
  return {
    left: `${((from - Y0) / (Y1 - Y0)) * 100}%`,
    width: `${((to - from) / (Y1 - Y0)) * 100}%`,
  }
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-mute text-[11px] leading-snug">{label}</dt>
      <dd>
        <BigNumber className="text-[22px]">{value}</BigNumber>
      </dd>
    </div>
  )
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
        <h2
          id="sensors-title"
          className="text-[28px] leading-[1.1] font-bold tracking-tight sm:text-[32px]"
        >
          Two satellites, <span className="serif">one</span> record
        </h2>
        <p className="text-soft mt-4 max-w-md text-[15px] leading-relaxed">
          VIIRS (since 2012) sees far more small fires than MODIS (since 2002). We calibrate MODIS
          on the years <strong className="text-bone">both were in orbit</strong>, so the whole
          record counts fire the same way.
        </p>
        <Link
          to="/method"
          className="text-saffron mt-5 inline-flex items-center gap-1.5 text-[14px] font-semibold"
        >
          How it works <ArrowRight className="size-4" />
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
              style: 'bg-[#e7ddd2] text-on-accent',
            },
            {
              name: 'VIIRS',
              sub: 'Suomi NPP, NOAA-20, 375 m',
              from: 2012,
              to: lastYear + 1,
              label: 'Feb 2012 →',
              style: 'bg-saffron text-on-accent',
            },
            {
              name: 'Harmonized',
              sub: 'this record',
              from: 2002.5,
              to: lastYear + 1,
              label: 'One unit, 2002 →',
              style: 'bg-gradient-to-r from-coral via-saffron to-[#fbe7a8] text-on-accent',
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
            <strong className="text-bone">Hatched: both in orbit.</strong> 2012–2017 trains each
            country&apos;s model, 2018–2021 tests it.
          </p>
          <dl
            className={`bg-card-2 grid gap-2 rounded-[14px] p-4 text-center ${region ? 'grid-cols-3' : 'grid-cols-1'}`}
          >
            <Stat
              value={ratio ? `×${ratio.toFixed(1)}` : '–'}
              label="VIIRS hotspots per MODIS hotspot here"
            />
            {region && (
              <>
                <Stat
                  value={region.exam_r2 === null ? '–' : region.exam_r2.toFixed(2)}
                  label={`Model fit (R²), ${region.name}`}
                />
                <Stat
                  value={
                    region.exam_bias_pct === null
                      ? '–'
                      : formatSignedPct(region.exam_bias_pct).replace(/^0%$/, '±0%')
                  }
                  label={`Model bias, ${region.name}`}
                />
              </>
            )}
          </dl>
        </div>
      </Card>
      {sensors && (
        <Card className="min-w-0 p-5 sm:p-6 lg:col-span-2">
          <h3 className="text-[18px] font-semibold">Before and after harmonizing</h3>
          <p className="text-soft mt-1 mb-4 text-[13px]">
            Hotspots per year in this area: each satellite raw, and the harmonized record.
          </p>
          <SensorsChart data={sensors} />
        </Card>
      )}
    </div>
  )
}
