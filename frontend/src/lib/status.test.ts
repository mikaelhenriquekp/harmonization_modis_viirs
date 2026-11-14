import { describe, expect, it } from 'vitest'

import { statusMeta } from './status'

describe('statusMeta', () => {
  it('describes every status in words, never color alone', () => {
    for (const s of [
      'much_above',
      'above',
      'normal',
      'below',
      'much_below',
      'no_history',
    ] as const) {
      const m = statusMeta(s)
      expect(m.label.length).toBeGreaterThan(0)
      expect(m.phrase.length).toBeGreaterThan(0)
    }
  })

  it('makes the mascot worry when fire is far above normal', () => {
    expect(statusMeta('much_above').mood).toBe('alarmed')
    expect(statusMeta('normal').mood).toBe('calm')
    expect(statusMeta('much_below').mood).toBe('happy')
  })

  it('falls back for unknown statuses', () => {
    expect(statusMeta('weird').label).toBe('No comparison')
  })
})
