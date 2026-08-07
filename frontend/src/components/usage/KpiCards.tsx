import { useId, type ReactNode } from "react"
import {
  Activity,
  Braces,
  Gauge,
  Timer,
  XCircle,
  Zap,
} from "lucide-react"
import { Area, AreaChart, ResponsiveContainer } from "recharts"

import {
  CHART_COLORS,
  STATUS_COLORS,
  formatDuration,
  formatRate,
  formatTokens,
  type Kpis,
  type TimeBucket,
} from "@/lib/usage-data"
import { Card, CardContent } from "../ui/card"

interface KpiCardProps {
  label: string
  value: string
  hint?: string
  icon: ReactNode
  color: string
  series: number[]
}

function KpiCard({ label, value, hint, icon, color, series }: KpiCardProps) {
  const rawId = useId()
  const gradientId = `kpi-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`
  const points = series.map((point, index) => ({ index, point }))
  return (
    <Card className="gap-0 overflow-hidden">
      <CardContent className="px-4 py-3.5">
        <div className="flex items-center gap-2">
          <span
            className="flex size-6 shrink-0 items-center justify-center rounded-md"
            style={{ backgroundColor: `${color}1f`, color }}
          >
            {icon}
          </span>
          <p className="truncate text-xs text-muted-foreground">{label}</p>
        </div>
        <p className="mt-1.5 truncate font-mono text-xl font-semibold leading-tight">
          {value}
        </p>
        {hint ? (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>
        ) : null}
        <div className="mt-2 h-9">
          {series.length >= 2 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="point"
                  stroke={color}
                  strokeWidth={1.5}
                  fill={`url(#${gradientId})`}
                  isAnimationActive={false}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center rounded-md bg-muted/40 text-[10px] text-muted-foreground">
              no trend yet
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function KpiCards({ kpis, buckets }: { kpis: Kpis; buckets: TimeBucket[] }) {
  const cards: KpiCardProps[] = [
    {
      label: "Total requests",
      value: kpis.requests.toLocaleString(),
      hint: `${buckets.length} time buckets in window`,
      icon: <Activity className="size-3.5" />,
      color: CHART_COLORS[1],
      series: buckets.map((bucket) => bucket.count),
    },
    {
      label: "Total tokens",
      value: formatTokens(kpis.inputTokens + kpis.outputTokens),
      hint: `${formatTokens(kpis.inputTokens)} in · ${formatTokens(kpis.outputTokens)} out`,
      icon: <Braces className="size-3.5" />,
      color: CHART_COLORS[0],
      series: buckets.map((bucket) => bucket.tokens),
    },
    {
      label: "Tokens / minute",
      value: formatTokens(Math.round(kpis.tpm)),
      hint: "in+out · last 60s",
      icon: <Gauge className="size-3.5" />,
      color: CHART_COLORS[3],
      series: buckets.map((bucket) => (bucket.tokens / bucket.bucketSeconds) * 60),
    },
    {
      label: "Avg latency",
      value: formatDuration(kpis.avgLatencyMs),
      hint: "per request",
      icon: <Timer className="size-3.5" />,
      color: CHART_COLORS[7],
      series: buckets.map((bucket) =>
        bucket.latencyCount > 0 ? bucket.latencySum / bucket.latencyCount : 0,
      ),
    },
    {
      label: "Error rate",
      value: formatRate(kpis.errorRate),
      hint: `${kpis.errors} errors · ${kpis.cancelled} cancelled`,
      icon: <XCircle className="size-3.5" />,
      color: STATUS_COLORS.error,
      series: buckets.map((bucket) => (bucket.count > 0 ? bucket.error / bucket.count : 0)),
    },
    {
      label: "Tokens / second",
      value: kpis.tps.toFixed(1),
      hint: "output only · last 60s",
      icon: <Zap className="size-3.5" />,
      color: CHART_COLORS[2],
      series: buckets.map((bucket) => bucket.tokens / bucket.bucketSeconds),
    },
  ]
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <KpiCard key={card.label} {...card} />
      ))}
    </div>
  )
}
