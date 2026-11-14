import { ArrowDown, ArrowUp } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'

import { formatSignedPct } from '@/lib/format'
import { cn } from '@/lib/utils'

/** The wireframe's card: warm dark surface with a hairline. */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('bg-card border-line rounded-[20px] border', className)} {...props} />
}

/** "▲ 10%" in coral when up, "▼ 4%" in slate when down. */
export function Delta({ pct, className }: { pct: number | null | undefined; className?: string }) {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return null
  const up = pct >= 0
  const Icon = up ? ArrowUp : ArrowDown
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-mono text-[11px] font-medium',
        up ? 'text-coral' : 'text-slate',
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      <span className="sr-only">{up ? 'up' : 'down'} </span>
      {formatSignedPct(pct).replace(/^[+−]/, '')}
    </span>
  )
}

/** A big monospaced number. */
export function BigNumber({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('num font-mono font-semibold tracking-tight', className)}>{children}</p>
}

/** A ring filled to a share, with the share in the middle. */
export function Ring({ share, color, label }: { share: number; color: string; label: string }) {
  const r = 26
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, share))
  return (
    <svg viewBox="0 0 64 64" className="size-14 shrink-0" role="img" aria-label={label}>
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--line)" strokeWidth="5" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${v * c} ${c}`}
        transform="rotate(-90 32 32)"
      />
      <text
        x="32"
        y="32"
        dy="0.35em"
        textAnchor="middle"
        className="fill-[var(--bone)] font-mono text-[13px] font-semibold"
      >
        {Math.round(v * 100)}%
      </text>
    </svg>
  )
}
