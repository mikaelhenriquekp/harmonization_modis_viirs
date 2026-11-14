import { ApiError, api } from './client'

export type HealthStatus = 'ok' | 'degraded' | 'down'

export interface HealthReport {
  status: HealthStatus
  database: HealthStatus
  migration_version: number
  greeting?: string
}

export async function getHealth(signal?: AbortSignal): Promise<HealthReport> {
  try {
    return await api.get<HealthReport>('/health', { signal })
  } catch (err) {
    if (err instanceof ApiError && err.status === 503 && isHealthReport(err.body)) {
      return err.body
    }
    throw err
  }
}

function isHealthReport(v: unknown): v is HealthReport {
  return typeof v === 'object' && v !== null && 'status' in v && 'database' in v
}
