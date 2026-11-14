import { X } from 'lucide-react'
import { lazy, Suspense, useEffect, useReducer, useRef } from 'react'

import { DrawTools } from '@/components/explore/draw-tools'
import { PlacePicker } from '@/components/explore/place-picker'
import { Skeleton } from '@/components/state'
import { useRegions } from '@/hooks/use-fire'
import type { Area } from '@/lib/area'
import { drawingReducer, initialDrawing } from '@/lib/drawing'

const AreaMap = lazy(() =>
  import('@/components/explore/area-map').then((m) => ({ default: m.AreaMap })),
)

const DRAWN_NAMES = {
  polygon: 'Your shape',
  bbox: 'Your rectangle',
  point: 'Around your point',
  world: 'The whole world',
} as const

interface AreaEditorProps {
  open: boolean
  area: Area
  onClose: () => void
  onChange: (area: Area, name: string) => void
}

/** Change the area: pick a place or country, or draw it on the map. */
export function AreaEditor({ open, area, onClose, onChange }: AreaEditorProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const regions = useRegions()
  const [drawing, dispatch] = useReducer(drawingReducer, initialDrawing)

  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (open && !d.open) d.showModal?.()
    if (!open && d.open) d.close?.()
  }, [open])

  useEffect(() => {
    if (drawing.done) {
      onChange(drawing.done, DRAWN_NAMES[drawing.done.kind])
      dispatch({ type: 'consumed' })
      onClose()
    }
  }, [drawing.done, onChange, onClose])

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-label="Change the area"
      className="bg-card border-line text-bone m-auto w-[min(960px,calc(100vw-1.5rem))] max-w-none rounded-[20px] border p-0 backdrop:bg-black/60"
    >
      {open && (
        <div className="flex max-h-[90svh] flex-col gap-4 overflow-y-auto p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Area of interest</p>
              <h2 className="text-xl font-semibold">Pick a place or draw your own</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-soft grid size-9 place-items-center rounded-full hover:bg-white/5"
            >
              <X className="size-5" />
            </button>
          </div>
          <PlacePicker
            regions={regions.data}
            onPick={(a, n) => {
              onChange(a, n)
              onClose()
            }}
          />
          <DrawTools drawing={drawing} dispatch={dispatch} />
          <div className="border-line overflow-hidden rounded-[16px] border">
            <Suspense fallback={<Skeleton className="h-[52svh] rounded-none" />}>
              <AreaMap
                area={area}
                drawing={drawing}
                dispatch={dispatch}
                layer="none"
                className="h-[52svh] min-h-[280px] w-full"
              />
            </Suspense>
          </div>
        </div>
      )}
    </dialog>
  )
}
