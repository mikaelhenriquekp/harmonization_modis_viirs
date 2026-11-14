import type { Status } from '@/api/types'

export type Mood = 'alarmed' | 'worried' | 'calm' | 'happy' | 'curious'
export type Tone = 'critical' | 'serious' | 'neutral' | 'cool' | 'cooler' | 'none'

export interface StatusMeta {
  /** Short label for chips and legends. */
  label: string
  /** Completes "This month is …". */
  phrase: string
  tone: Tone
  mood: Mood
}

const META: Record<Status, StatusMeta> = {
  much_above: {
    label: 'Far above normal',
    phrase: 'far above normal',
    tone: 'critical',
    mood: 'alarmed',
  },
  above: { label: 'Above normal', phrase: 'above normal', tone: 'serious', mood: 'worried' },
  normal: { label: 'Normal', phrase: 'within the normal range', tone: 'neutral', mood: 'calm' },
  below: { label: 'Below normal', phrase: 'below normal', tone: 'cool', mood: 'happy' },
  much_below: {
    label: 'Far below normal',
    phrase: 'far below normal',
    tone: 'cooler',
    mood: 'happy',
  },
  no_history: {
    label: 'No comparison',
    phrase: 'without past years to compare with',
    tone: 'none',
    mood: 'curious',
  },
}

export const STATUS_ORDER: Status[] = [
  'much_above',
  'above',
  'normal',
  'below',
  'much_below',
  'no_history',
]

export function statusMeta(status: string): StatusMeta {
  return META[status as Status] ?? META.no_history
}

/** The CSS color of each tone, for marks and icons (text keeps the ink colors). */
export const TONE_COLOR: Record<Tone, string> = {
  critical: 'var(--tone-critical)',
  serious: 'var(--tone-serious)',
  neutral: 'var(--tone-neutral)',
  cool: 'var(--tone-cool)',
  cooler: 'var(--tone-cooler)',
  none: 'var(--tone-none)',
}
