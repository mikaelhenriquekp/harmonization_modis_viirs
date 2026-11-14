import { useEffect, useState } from 'react'

import base from '@/assets/mascot/base.png'
import eyesClosed from '@/assets/mascot/eyes-closed.png'
import eyesHalf from '@/assets/mascot/eyes-half.png'
import eyesHappy from '@/assets/mascot/eyes-happy.png'
import eyesOpen from '@/assets/mascot/eyes-open.png'
import mouthClosed from '@/assets/mascot/mouth-closed.png'
import mouthLarge from '@/assets/mascot/mouth-large.png'
import mouthMedium from '@/assets/mascot/mouth-medium.png'
import mouthO from '@/assets/mascot/mouth-o.png'
import mouthRest from '@/assets/mascot/mouth-rest.png'
import mouthSmall from '@/assets/mascot/mouth-small.png'
import mouthWide from '@/assets/mascot/mouth-wide.png'
import type { Phase } from '@/hooks/use-assistant'
import { cn } from '@/lib/utils'

/** Mouth shapes cycled while Ember talks, weighted to look like speech. */
const TALK = [mouthSmall, mouthMedium, mouthLarge, mouthO, mouthMedium, mouthClosed, mouthSmall]

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

function useTalk(on: boolean): string {
  const [mouth, setMouth] = useState(mouthRest)
  useEffect(() => {
    if (!on || reducedMotion()) return
    let timer: ReturnType<typeof setTimeout>
    const next = () => {
      setMouth(TALK[(Math.random() * TALK.length) | 0])
      timer = setTimeout(next, 70 + Math.random() * 90)
    }
    next()
    return () => clearTimeout(timer)
  }, [on])
  return on ? mouth : mouthRest
}

function useBlink(on: boolean): boolean {
  const [closed, setClosed] = useState(false)
  useEffect(() => {
    if (!on || reducedMotion()) return
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      timer = setTimeout(
        () => {
          setClosed(true)
          timer = setTimeout(() => {
            setClosed(false)
            schedule()
          }, 130)
        },
        2200 + Math.random() * 2800,
      )
    }
    schedule()
    return () => clearTimeout(timer)
  }, [on])
  return closed
}

/** Briefly happy after an answer lands. */
function useJustDone(phase: Phase): boolean {
  const [happy, setHappy] = useState(false)
  const [prev, setPrev] = useState(phase)
  if (prev !== phase) {
    setPrev(phase)
    if (phase === 'idle' && prev === 'speaking') setHappy(true)
    else if (phase !== 'idle') setHappy(false)
  }
  useEffect(() => {
    if (!happy) return
    const t = setTimeout(() => setHappy(false), 1800)
    return () => clearTimeout(t)
  }, [happy])
  return happy
}

/** The paparajote astronaut, lip-syncing to Ember's stream. */
export function TalkingMascot({ phase, className }: { phase: Phase; className?: string }) {
  const happy = useJustDone(phase)
  const mouth = useTalk(phase === 'speaking')
  const focused = phase === 'working' || phase === 'thinking'
  const blinking = useBlink(!focused && !happy)
  const eyes = happy ? eyesHappy : focused ? eyesHalf : blinking ? eyesClosed : eyesOpen
  const layer = 'absolute inset-0 size-full select-none'
  const label =
    phase === 'speaking'
      ? 'Ember is answering'
      : focused
        ? 'Ember is looking at the data'
        : 'Ember, the fire analyst'
  return (
    <div role="img" aria-label={label} className={cn('relative aspect-square', className)}>
      <img src={base} alt="" className={layer} draggable={false} />
      <img src={eyes} alt="" className={layer} draggable={false} />
      <img
        src={happy ? mouthWide : focused ? mouthSmall : mouth}
        alt=""
        className={layer}
        draggable={false}
      />
    </div>
  )
}
