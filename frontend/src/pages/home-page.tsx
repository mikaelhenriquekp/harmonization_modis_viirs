import { HealthStatus } from '@/components/health-status'
import { useHealth } from '@/hooks/use-health'

export function HomePage() {
  const { data, isLoading, error, isFetching, refetch } = useHealth()

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <HealthStatus
        data={data}
        isLoading={isLoading}
        error={error}
        isRefreshing={isFetching}
        onRefresh={() => void refetch()}
      />
    </main>
  )
}
