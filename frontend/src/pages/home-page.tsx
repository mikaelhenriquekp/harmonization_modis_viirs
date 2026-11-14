import mascot from '@/assets/mascot.webp'
import { HealthStatus } from '@/components/health-status'
import { useHealth } from '@/hooks/use-health'

export function HomePage() {
  const { data, isLoading, error, isFetching, refetch } = useHealth()

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <img
        src={mascot}
        alt="Paparajote Lunar mascot"
        width={192}
        height={192}
        className="size-48"
      />
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
