import {
  CheckCircle2,
  CircleAlert,
  Database,
  GitCommitVertical,
  Loader2,
  RefreshCw,
} from 'lucide-react'

import type { HealthReport, HealthStatus as Status } from '@/api/health'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

interface HealthStatusProps {
  data?: HealthReport
  isLoading: boolean
  error: Error | null
  isRefreshing?: boolean
  onRefresh: () => void
}

export function HealthStatus({
  data,
  isLoading,
  error,
  isRefreshing,
  onRefresh,
}: HealthStatusProps) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">{data?.greeting ?? 'Hello!'}</CardTitle>
        <CardDescription>Backend health, checked live via /api/health.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Checking backend…
          </p>
        ) : error ? (
          <p role="alert" className="text-destructive flex items-center gap-2 text-sm">
            <CircleAlert className="size-4" /> Backend unreachable: {error.message}
          </p>
        ) : data ? (
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="size-4" /> API
            </dt>
            <dd>
              <StatusBadge status={data.status} />
            </dd>
            <dt className="text-muted-foreground flex items-center gap-2">
              <Database className="size-4" /> Database
            </dt>
            <dd>
              <StatusBadge status={data.database} />
            </dd>
            <dt className="text-muted-foreground flex items-center gap-2">
              <GitCommitVertical className="size-4" /> Migration
            </dt>
            <dd>
              <Badge variant="outline">v{data.migration_version}</Badge>
            </dd>
          </dl>
        ) : null}
      </CardContent>

      <CardFooter>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
          <RefreshCw className={isRefreshing ? 'animate-spin' : undefined} />
          Refresh
        </Button>
      </CardFooter>
    </Card>
  )
}

function StatusBadge({ status }: { status: Status }) {
  const variant = status === 'ok' ? 'default' : status === 'degraded' ? 'secondary' : 'destructive'
  return <Badge variant={variant}>{status}</Badge>
}
