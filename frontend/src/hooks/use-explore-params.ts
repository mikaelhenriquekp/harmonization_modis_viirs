import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

import { areaToSearch, parseAreaSearch, type Area } from '@/lib/area'
import { DEFAULT_PLACE } from '@/lib/places'

export interface ExploreParams {
  area: Area
  name: string
  from?: string
  to?: string
}

/**
 * The area and period being explored, kept in the URL so every view is a
 * shareable link: ?area=bbox:-2.35,37.37,-0.65,38.76&name=Región de Murcia&from=2010-01
 */
export function useExploreParams() {
  const [params, setParams] = useSearchParams()

  const value = useMemo<ExploreParams>(() => {
    const area = parseAreaSearch(params.get('area'))
    return {
      area: area ?? DEFAULT_PLACE.area,
      name: params.get('name') ?? (area ? 'Your area' : DEFAULT_PLACE.name),
      from: params.get('from') ?? undefined,
      to: params.get('to') ?? undefined,
    }
  }, [params])

  const update = useCallback(
    (patch: Partial<ExploreParams>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (patch.area) next.set('area', areaToSearch(patch.area))
          if (patch.name !== undefined) next.set('name', patch.name)
          for (const k of ['from', 'to'] as const) {
            if (k in patch) {
              const v = patch[k]
              if (v) next.set(k, v)
              else next.delete(k)
            }
          }
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  return [value, update] as const
}
