import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from './client'
import { getHealth } from './health'

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })))
}

describe('getHealth', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns the report on 200', async () => {
    mockFetch(200, { status: 'ok', database: 'ok', migration_version: 1 })
    await expect(getHealth()).resolves.toMatchObject({ status: 'ok' })
    expect(fetch).toHaveBeenCalledWith('/api/health', expect.anything())
  })

  it('returns the report on 503 so the UI can show which dependency is down', async () => {
    mockFetch(503, { status: 'down', database: 'down', migration_version: 0 })
    await expect(getHealth()).resolves.toMatchObject({ database: 'down' })
  })

  it('throws ApiError on other failures', async () => {
    mockFetch(500, { error: 'boom' })
    await expect(getHealth()).rejects.toBeInstanceOf(ApiError)
  })
})
