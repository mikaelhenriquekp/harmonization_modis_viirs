import { useEffect, useState } from 'react'

import base from '@/assets/mascot/base.png'
import eyesClosed from '@/assets/mascot/eyes-closed.png'
import eyesHalf from '@/assets/mascot/eyes-half.png'
import eyesHappy from '@/assets/mascot/eyes-happy.png'
import eyesOpen from '@/assets/mascot/eyes-open.png'
import mouthFrown from '@/assets/mascot/mouth-frown.png'
import mouthO from '@/assets/mascot/mouth-o.png'
import mouthRest from '@/assets/mascot/mouth-rest.png'
import mouthSmall from '@/assets/mascot/mouth-small.png'
import mouthWide from '@/assets/mascot/mouth-wide.png'
import type { Mood } from '@/lib/status'
import { cn } from '@/lib/utils'

const FACES: Record<Mood, { eyes: string; mouth: string }> = {
  alarmed: { eyes: eyesOpen, mouth: mouthO },
  worried: { eyes: eyesOpen, mouth: mouthFrown },
  calm: { eyes: eyesOpen, mouth: mouthRest },
  happy: { eyes: eyesHappy, mouth: mouthWide },
  curious: { eyes: eyesHalf, mouth: mouthSmall },
}

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

/** Blinks every few seconds, like the talking rig does. */
function useBlink(enabled: boolean): boolean {
  const [closed, setClosed] = useState(false)
  useEffect(() => {
    if (!enabled || reducedMotion()) return
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      timer = setTimeout(
        () => {
          setClosed(true)
          timer = setTimeout(() => {
            setClosed(false)
            schedule()
          }, 140)
        },
        3000 + Math.random() * 3000,
      )
    }
    schedule()
    return () => clearTimeout(timer)
  }, [enabled])
  return closed
}

interface MascotProps {
  mood: Mood
  /** Describes the mascot for screen readers. */
  label: string
  className?: string
}

/** The paparajote astronaut, reacting to the fire situation. */
export function Mascot({ mood, label, className }: MascotProps) {
  const face = FACES[mood]
  const blinking = useBlink(face.eyes === eyesOpen)
  const layer = 'absolute inset-0 size-full select-none'
  return (
    <div role="img" aria-label={label} className={cn('relative aspect-square', className)}>
      <img src={base} alt="" className={layer} draggable={false} />
      <img src={blinking ? eyesClosed : face.eyes} alt="" className={layer} draggable={false} />
      <img src={face.mouth} alt="" className={layer} draggable={false} />
    </div>
  )
}
