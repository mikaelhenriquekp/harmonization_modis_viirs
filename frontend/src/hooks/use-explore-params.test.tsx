import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { DEFAULT_PLACE } from '@/lib/places'

import { useExploreParams } from './use-explore-params'

function wrapper(url: string) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  )
}

describe('useExploreParams', () => {
  it('starts on the default place', () => {
    const { result } = renderHook(() => useExploreParams(), { wrapper: wrapper('/') })
    expect(result.current[0]).toMatchObject({ area: DEFAULT_PLACE.area, name: DEFAULT_PLACE.name })
  })

  it('can start somewhere else', () => {
    const world = { area: { kind: 'world' as const }, name: 'The whole world' }
    const { result } = renderHook(() => useExploreParams(world), { wrapper: wrapper('/') })
    expect(result.current[0]).toMatchObject(world)
  })

  it('reads a shared link', () => {
    const { result } = renderHook(() => useExploreParams(), {
      wrapper: wrapper('/?area=point:38,-1.1,10&name=Home&from=2010-01'),
    })
    expect(result.current[0]).toEqual({
      area: { kind: 'point', lat: 38, lon: -1.1, radiusKm: 10 },
      name: 'Home',
      from: '2010-01',
      to: undefined,
    })
  })

  it('updates the area and clears the period', () => {
    const { result } = renderHook(() => useExploreParams(), { wrapper: wrapper('/?from=2010-01') })
    act(() => result.current[1]({ area: { kind: 'world' }, name: 'World', from: undefined }))
    expect(result.current[0]).toMatchObject({
      area: { kind: 'world' },
      name: 'World',
      from: undefined,
    })
  })
})
