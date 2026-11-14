import { describe, expect, it } from 'vitest'

import { calendarFixture } from '@/test/fixtures'

import { GUIDE_TOPICS, guideMood } from './guide'

const topic = (id: string) => GUIDE_TOPICS.find((t) => t.id === id)!

describe('guide', () => {
  it('reads the current month from the data on screen', () => {
    const text = topic('here').answer({ name: 'Murcia', calendar: calendarFixture() })
    expect(text).toContain('In Murcia, March 2013 is far above normal: 10 hotspots so far.')
    expect(text).toContain('3 other years')
  })

  it('describes the fire season', () => {
    const text = topic('season').answer({ name: 'Murcia', calendar: calendarFixture() })
    expect(text).toContain('the usual peak is August')
    expect(text).toContain('August 2012 with 102 hotspots')
  })

  it('never invents numbers while the data is loading', () => {
    expect(topic('here').answer({ name: 'Murcia' })).toMatch(/still loading/)
    expect(topic('sensors').answer({ name: 'Murcia' })).not.toMatch(/Here VIIRS counted/)
    expect(topic('sensors').answer({ name: 'Murcia', ratio: 5 })).toContain('about 5 hotspots')
  })

  it('looks alarmed when the month is far above normal', () => {
    expect(guideMood({ name: 'x', calendar: calendarFixture() })).toBe('alarmed')
    expect(guideMood({ name: 'x' })).toBe('curious')
  })
})
