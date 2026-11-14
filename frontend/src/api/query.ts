/** Builds "?a=1&b=2" from defined values; empty string when there are none. */
export function toQuery(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v))
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}
