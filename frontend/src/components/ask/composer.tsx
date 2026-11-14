import { ArrowUp, MapPin, Square, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

import type { Phase } from '@/hooks/use-assistant'
import { cn } from '@/lib/utils'

export const MAX_QUESTION = 2000

interface ComposerProps {
  phase: Phase
  disabled?: boolean
  contextLabel?: string
  onClearContext?: () => void
  onSend: (q: string) => void
  onStop: () => void
  autoFocus?: boolean
}

/** Where the question is typed: Enter sends, Shift+Enter adds a line. */
export function Composer({
  phase,
  disabled,
  contextLabel,
  onClearContext,
  onSend,
  onStop,
  autoFocus,
}: ComposerProps) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  const busy = phase !== 'idle'
  const tooLong = value.length > MAX_QUESTION
  const canSend = !busy && !disabled && value.trim().length > 0 && !tooLong

  // grow with the text, up to a few lines
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }, [value])

  // not on touch screens: the keyboard would cover the page
  useEffect(() => {
    if (autoFocus && !window.matchMedia?.('(pointer: coarse)').matches) {
      ref.current?.focus({ preventScroll: true })
    }
  }, [autoFocus])

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!canSend) return
    onSend(value)
    setValue('')
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <form
      onSubmit={submit}
      data-hot={busy}
      className="ember-edge bg-card/85 rounded-[26px] p-2 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.9)] backdrop-blur-xl"
    >
      {contextLabel && (
        <div className="flex px-2 pt-1 pb-1.5">
          <span className="bg-slate-soft text-slate inline-flex max-w-full items-center gap-1.5 rounded-full py-1 pr-1 pl-2.5 text-[12px] font-medium">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">About: {contextLabel}</span>
            {onClearContext && (
              <button
                type="button"
                onClick={onClearContext}
                aria-label="Ask about anywhere instead"
                className="grid size-5 place-items-center rounded-full hover:bg-white/10"
              >
                <X className="size-3" />
              </button>
            )}
          </span>
        </div>
      )}
      <div className="flex items-end gap-2">
        <label htmlFor="ask-input" className="sr-only">
          Ask Ember about fire
        </label>
        <textarea
          id="ask-input"
          ref={ref}
          rows={1}
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKey}
          placeholder={
            disabled ? 'Ember is not available right now' : 'Ask about any place or year…'
          }
          className="placeholder:text-mute max-h-[180px] min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-[16px] leading-6 outline-none disabled:cursor-not-allowed"
        />
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop the answer"
            className="bg-card-2 text-bone hover:bg-line grid size-11 shrink-0 place-items-center rounded-full transition-colors"
          >
            <Square className="size-4" fill="currentColor" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Ask"
            className={cn(
              'grid size-11 shrink-0 place-items-center rounded-full transition-all duration-300',
              canSend
                ? 'from-saffron via-coral to-garnet text-on-accent bg-gradient-to-br shadow-[0_8px_24px_-6px_rgb(238_143_90/0.8)] hover:scale-105'
                : 'bg-card-2 text-mute',
            )}
          >
            <ArrowUp className="size-5" strokeWidth={2.5} />
          </button>
        )}
      </div>
      <div className="text-mute flex justify-between px-3 pt-1 pb-0.5 text-[11px]">
        <span className="hidden sm:inline">Enter to ask · Shift + Enter for a new line</span>
        {value.length > MAX_QUESTION * 0.8 && (
          <span className={cn('num ml-auto font-mono', tooLong && 'text-coral')}>
            {value.length} / {MAX_QUESTION}
          </span>
        )}
      </div>
    </form>
  )
}
