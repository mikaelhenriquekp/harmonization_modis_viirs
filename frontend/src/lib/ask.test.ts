import { describe, expect, it } from 'vitest'

import { askLink, contextFromSearch, describeArgs, describeContext, toolMeta } from './ask'

describe('ask helpers', () => {
  it('describes tool calls in short', () => {
    expect(
      describeArgs({ area: { kind: 'bbox', name: 'Iberia' }, from: '2020-01', to: '2024-12' }),
    ).toBe('Iberia · Jan 2020 – Dec 2024')
    expect(describeArgs({ area: { kind: 'world' }, month: '2026-11' })).toBe('World · Nov 2026')
    expect(describeArgs({ query: 'Chile' })).toBe('“Chile”')
    expect(describeArgs(undefined)).toBe('')
    expect(toolMeta('get_calendar').active).toMatch(/calendar/)
    expect(toolMeta('mystery').done).toBe('mystery')
  })

  it('round-trips the page context through the URL', () => {
    const link = askLink(
      {
        area: { kind: 'bbox', west: -9.6, south: 35.9, east: 4.4, north: 43.9 },
        name: 'Iberia',
        from: '2020-01',
      },
      'Is it bad?',
    )
    const params = new URLSearchParams(link.split('?')[1])
    expect(params.get('q')).toBe('Is it bad?')
    const ctx = contextFromSearch(params)
    expect(ctx).toEqual({ area: 'bbox:-9.6,35.9,4.4,43.9', name: 'Iberia', from: '2020-01' })
    expect(describeContext(ctx!)).toBe('Iberia · Jan 2020 – now')
    expect(contextFromSearch(new URLSearchParams('from=bad'))).toBeUndefined()
    expect(askLink({})).toBe('/ask')
  })
})
