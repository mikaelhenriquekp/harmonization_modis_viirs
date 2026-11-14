import { useQuery } from '@tanstack/react-query'

import { countryAt } from '@/lib/country'

/** The country under a point, from its real borders. */
export function useCountry(point: { lat: number; lon: number } | null) {
  return useQuery({
    queryKey: ['country', point?.lat, point?.lon] as const,
    queryFn: () => countryAt(point!.lat, point!.lon),
    enabled: !!point,
    staleTime: Infinity,
  })
}
