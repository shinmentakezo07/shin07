import { useId, useState } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import {
  STATUS_COLORS,
  formatTokens,
  type TimeBucket,
} from "@/lib/usage-data"
import { cn } from "@/lib/utils"
import { ChartCard, ChartTooltip } from "./chart-primitives"

type Metric = "requests" | "tokens"

const METRICS: { key: Metric; label: string }[] = [
  { key: "requests", label: "Requests" },
  { key: "tokens", label: "Tokens" },
]

export function VolumeAreaChart({ buckets }: { buckets: TimeBucket[] }) {
  const [metric, setMetric] = useState<Metric>("requests")
  const rawId = useId()
  const suffix = rawId.replace(/[^a-zA-Z0-9]/g, "")
  const data = buckets.map((bucket) => ({
    label: bucket.label,
    success: metric === "requests" ? bucket.success : bucket.successTokens,
    error: metric === "requests" ? bucket.error : bucket.errorTokens,
    cancelled: metric === "requests" ? bucket.cancelled : bucket.cancelledTokens,
  }))
  const totals = data.reduce(
    (sum, row) => ({
      success: sum.success + row.success,
      error: sum.error + row.error,
      cancelled: sum.cancelled + row.cancelled,
    }),
    { success: 0, error: 0, cancelled: 0 },
  )
  const formatter = (value: number, _name: string) =>
    metric === "tokens" ? formatTokens(value) : String(value)

  return (
    <ChartCard
      title="Request volume"
      subtitle="Requests per time bucket, stacked by status"
      className="h-full"
      actions={
        <div
          className="flex items-center gap-1 rounded-lg border bg-muted/40 p-0.5"
          role="group"
          aria-label="Chart metric"
        >
          {METRICS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                metric === option.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setMetric(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <defs>
              {(["success", "error", "cancelled"] as const).map((status) => (
                <linearGradient
                  key={status}
                  id={`vol-${suffix}-${status}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor={STATUS_COLORS[status]}
                    stopOpacity={0.45}
                  />
                  <stop
                    offset="100%"
                    stopColor={STATUS_COLORS[status]}
                    stopOpacity={0.05}
                  />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid
              stroke="var(--border)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              minTickGap={32}
              interval="preserveStartEnd"
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={40}
              allowDecimals={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            />
            <Tooltip content={<ChartTooltip formatter={formatter} />} />
            <Area
              type="monotone"
              dataKey="success"
              name="Success"
              stackId="volume"
              stroke={STATUS_COLORS.success}
              strokeWidth={1.5}
              fill={`url(#vol-${suffix}-success)`}
            />
            <Area
              type="monotone"
              dataKey="error"
              name="Error"
              stackId="volume"
              stroke={STATUS_COLORS.error}
              strokeWidth={1.5}
              fill={`url(#vol-${suffix}-error)`}
            />
            <Area
              type="monotone"
              dataKey="cancelled"
              name="Cancelled"
              stackId="volume"
              stroke={STATUS_COLORS.cancelled}
              strokeWidth={1.5}
              fill={`url(#vol-${suffix}-cancelled)`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {(
          [
            ["success", "Success"],
            ["error", "Error"],
            ["cancelled", "Cancelled"],
          ] as const
        ).map(([status, label]) => (
          <span
            key={status}
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: STATUS_COLORS[status] }}
            />
            {label}
            <span className="font-mono text-foreground">
              {metric === "tokens" ? formatTokens(totals[status]) : totals[status]}
            </span>
          </span>
        ))}
      </div>
    </ChartCard>
  )
}
