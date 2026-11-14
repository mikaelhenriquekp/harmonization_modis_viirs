import { Circle, MapPin, Pentagon, Square, Undo2, X } from 'lucide-react'
import type { ReactNode } from 'react'

import type { DrawingAction, DrawingState, Tool } from '@/lib/drawing'
import { cn } from '@/lib/utils'

const RADII = [1, 5, 10, 25, 50, 100]

const HELP: Record<Tool, (n: number) => string> = {
  polygon: (n) =>
    n === 0
      ? 'Tap the map to add corners. Tap the first corner again, or Finish shape, to close it.'
      : `Tap the map to add corners (${n} so far). Three or more make a shape.`,
  rectangle: (n) => (n === 0 ? 'Tap one corner of the rectangle.' : 'Now tap the opposite corner.'),
  point: () => 'Tap the place you care about.',
}

function ToolButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'border-line flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
        active ? 'bg-gold border-gold text-[#03133f]' : 'hover:bg-surface-2',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

/** Tools to draw the area of interest on the map, with step-by-step help. */
export function DrawTools({
  drawing,
  dispatch,
}: {
  drawing: DrawingState
  dispatch: (a: DrawingAction) => void
}) {
  const { tool, points } = drawing
  const start = (t: Tool) => dispatch(tool === t ? { type: 'cancel' } : { type: 'start', tool: t })
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Draw your area">
        <ToolButton
          active={tool === 'polygon'}
          onClick={() => start('polygon')}
          icon={<Pentagon className="size-4" />}
        >
          Draw a shape
        </ToolButton>
        <ToolButton
          active={tool === 'rectangle'}
          onClick={() => start('rectangle')}
          icon={<Square className="size-4" />}
        >
          Rectangle
        </ToolButton>
        <ToolButton
          active={tool === 'point'}
          onClick={() => start('point')}
          icon={<MapPin className="size-4" />}
        >
          Point
        </ToolButton>
      </div>
      {tool && (
        <div
          className="bg-surface-2 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm"
          aria-live="polite"
        >
          <p className="mr-auto">{HELP[tool](points.length)}</p>
          {tool === 'point' && (
            <label className="flex items-center gap-2">
              <Circle className="size-4" aria-hidden />
              <span>Radius</span>
              <select
                aria-label="Radius"
                value={drawing.radiusKm}
                onChange={(e) => dispatch({ type: 'radius', km: Number(e.target.value) })}
                className="bg-surface border-line rounded-md border px-2 py-1"
              >
                {RADII.map((r) => (
                  <option key={r} value={r}>
                    {r} km
                  </option>
                ))}
              </select>
            </label>
          )}
          {tool === 'polygon' && (
            <>
              <button
                type="button"
                onClick={() => dispatch({ type: 'undo' })}
                disabled={points.length === 0}
                aria-label="Undo corner"
                className="hover:bg-surface grid size-8 place-items-center rounded-full disabled:opacity-40"
              >
                <Undo2 className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: 'finish' })}
                disabled={points.length < 3}
                className="bg-gold rounded-full px-3 py-1 font-medium text-[#03133f] disabled:opacity-40"
              >
                Finish shape
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => dispatch({ type: 'cancel' })}
            className="hover:bg-surface flex items-center gap-1 rounded-full px-2 py-1"
          >
            <X className="size-4" aria-hidden />
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
