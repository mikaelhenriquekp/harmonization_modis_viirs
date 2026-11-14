import type { Calendar } from '@/api/types'

import { formatCount, formatMonth, monthName } from './format'
import { peakShare } from './insights'
import { statusMeta, type Mood } from './status'

export interface GuideContext {
  /** The place on screen. */
  name: string
  calendar?: Calendar
  /** VIIRS hotspots for each MODIS one in this place, when both were in orbit. */
  ratio?: number | null
}

export interface GuideTopic {
  id: string
  question: string
  answer: (c: GuideContext) => string
}

const WAIT = 'I am still loading the record of this place. Ask me again in a moment.'

/**
 * What the mascot can explain. Every answer is written here or read from the
 * data on screen: nothing is generated, so nothing is made up.
 */
export const GUIDE_TOPICS: GuideTopic[] = [
  {
    id: 'here',
    question: 'What is happening here?',
    answer: ({ name, calendar }) => {
      const cur = calendar?.current
      if (!calendar || !cur) return WAIT
      const usual =
        cur.median !== null
          ? ` The usual for a whole ${monthName(Number(cur.month.slice(5)))} is ${formatCount(cur.median)}.`
          : ''
      return `In ${name}, ${formatMonth(cur.month)} is ${statusMeta(cur.status).phrase}: ${formatCount(cur.hotspots)} hotspots${cur.incomplete ? ' so far' : ''}.${usual} I compare it with the same month of ${cur.years_compared} other years.`
    },
  },
  {
    id: 'season',
    question: 'When does it burn here?',
    answer: ({ name, calendar }) => {
      if (!calendar) return WAIT
      const top = peakShare(calendar, 3)
      const months = top.months.map((m) => monthName(m)).join(', ')
      return `In ${name} the usual peak is ${monthName(calendar.peak.month_of_year)}. The three busiest months (${months}) hold about ${Math.round(top.share)}% of a typical year. The record month was ${formatMonth(calendar.peak.record_month)} with ${formatCount(calendar.peak.record_hotspots)} hotspots, and the busiest year ${calendar.peak.busiest_year}.`
    },
  },
  {
    id: 'sensors',
    question: 'Why do MODIS and VIIRS disagree?',
    answer: ({ ratio }) =>
      `MODIS sees the ground in 1 km pixels and VIIRS in 375 m pixels, so VIIRS catches small and cool fires that MODIS misses.${ratio ? ` Here VIIRS counted about ${formatCount(ratio)} hotspots for each one MODIS counted while both were in orbit.` : ''} Putting the raw counts side by side would look like fire jumped in 2012. We learn the relation in 2012 to 2017, check it on 2018 to mid 2021, and express the MODIS years on the VIIRS scale.`,
  },
  {
    id: 'estimated',
    question: 'What does “estimated” mean?',
    answer: () =>
      'Months before February 2012 have no VIIRS. Their value is what VIIRS would probably have counted, worked out from MODIS Aqua. Trust them for monthly patterns and for comparing years, not for one specific fire.',
  },
  {
    id: 'hotspot',
    question: 'Is a hotspot a fire?',
    answer: () =>
      'No. A hotspot is one satellite pixel that looked hot at one overpass. A big fire gives many hotspots over several days, and a small or short one may give none, or hide under cloud and smoke. So a month without hotspots is a month without detections, not proof of no fire, and hotspots are not burned area.',
  },
  {
    id: 'frp',
    question: 'What is FRP?',
    answer: () =>
      'Fire radiative power, in megawatts: the heat a detection was giving off when the satellite passed. It tells apart a smouldering field from a crown fire. We add it up over the detections of each month.',
  },
  {
    id: 'daynight',
    question: 'Why a day and a night mode?',
    answer: () =>
      'The satellites pass early in the afternoon and again at night. By day, sunlight and hot ground make small fires harder to tell apart, but that is when most fires burn. At night the background is cold, so small fires stand out, though many have died down. On the 375 m layer, day mode shows the day passes and night mode the night ones. The harmonized counts always include both.',
  },
  {
    id: 'limits',
    question: 'What can this not tell me?',
    answer: () =>
      'It is a historical record, not a forecast or an alert system. The latest months are provisional and the current month is incomplete. Each country has its own harmonization model, and those marked “review” passed our check less well. For decisions on the ground, use it with your own sources.',
  },
]

/** How the mascot looks while answering. */
export function guideMood(c: GuideContext): Mood {
  return c.calendar?.current ? statusMeta(c.calendar.current.status).mood : 'curious'
}
