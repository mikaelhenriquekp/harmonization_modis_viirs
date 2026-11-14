import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, CircleHelp, Minus } from 'lucide-react'

import { TONE_COLOR, statusMeta, type Tone } from '@/lib/status'
import { cn } from '@/lib/utils'

const ICON = {
  critical: ArrowUpToLine,
  serious: ArrowUp,
  neutral: Minus,
  cool: ArrowDown,
  cooler: ArrowDownToLine,
  none: CircleHelp,
} satisfies Record<Tone, unknown>

/** A status with its icon and words, never color alone. */
export function StatusChip({ status, className }: { status: string; className?: string }) {
  const m = statusMeta(status)
  const Icon = ICON[m.tone]
  return (
    <span
      className={cn(
        'border-line inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" style={{ color: TONE_COLOR[m.tone] }} />
      {m.label}
    </span>
  )
}
