import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Mascot } from './mascot'

describe('Mascot', () => {
  it.each([
    ['alarmed', 'mouth-o', 'eyes-open'],
    ['worried', 'mouth-frown', 'eyes-open'],
    ['calm', 'mouth-rest', 'eyes-open'],
    ['happy', 'mouth-wide', 'eyes-happy'],
    ['curious', 'mouth-small', 'eyes-half'],
  ] as const)('shows a %s face', (mood, mouth, eyes) => {
    const { container } = render(<Mascot mood={mood} label="Paparajote" />)
    const srcs = [...container.querySelectorAll('img')].map((i) => i.getAttribute('src') ?? '')
    expect(srcs.some((s) => s.includes(mouth))).toBe(true)
    expect(srcs.some((s) => s.includes(eyes))).toBe(true)
  })

  it('is one image for assistive technology', () => {
    render(<Mascot mood="calm" label="The mascot looks calm" />)
    expect(screen.getByRole('img', { name: 'The mascot looks calm' })).toBeInTheDocument()
  })
})
