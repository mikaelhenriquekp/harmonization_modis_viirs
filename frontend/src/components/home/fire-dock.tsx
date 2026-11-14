import { Flame } from 'lucide-react'

/** The fire to drag onto the globe (or click to drop at the center of the view). */
export function FireDock({ onDropCenter }: { onDropCenter: () => void }) {
  return (
    <div className="bg-card border-line flex items-center gap-3 rounded-full border py-2 pr-6 pl-2">
      <button
        type="button"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', 'fire')
          e.dataTransfer.effectAllowed = 'copy'
        }}
        onClick={onDropCenter}
        aria-label="Drop the fire at the center of the globe"
        className="border-saffron grid size-14 shrink-0 cursor-grab place-items-center rounded-[16px] border-2 bg-[radial-gradient(circle_at_50%_70%,rgba(238,143,90,0.35),transparent_70%)] active:cursor-grabbing"
      >
        <Flame className="text-coral size-7" fill="currentColor" />
      </button>
      <div className="text-left">
        <p className="text-[14px] font-semibold">Drag the fire onto the globe</p>
        <p className="text-soft text-[12px]">
          or tap a place, or tap the fire to drop it at the center
        </p>
      </div>
    </div>
  )
}
