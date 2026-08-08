import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"

import {
  buildTokenMix,
  formatTokens,
  type Kpis,
} from "@/lib/usage-data"
import { ChartCard, ChartTooltip } from "./chart-primitives"
import { useResolvedTheme } from "./use-resolved-theme"

export function TokenDonut({ kpis }: { kpis: Kpis }) {
  const dark = useResolvedTheme() === "dark"
  const data = buildTokenMix(kpis, dark)
  const total = data.reduce((sum, datum) => sum + datum.value, 0)
  const totalTokens = kpis.inputTokens + kpis.outputTokens
  return (
    <ChartCard
      title="Token mix"
      subtitle="Input, output, cache, and reasoning tokens"
      contentClassName="flex flex-col"
    >
      <div className="relative mx-auto w-full max-w-56">
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                content={
                  <ChartTooltip
                    formatter={(value, name) => `${formatTokens(value)} · ${name}`}
                  />
                }
              />
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius="66%"
                outerRadius="92%"
                paddingAngle={2}
                cornerRadius={4}
                stroke="var(--card)"
                strokeWidth={2}
              >
                {data.map((datum) => (
                  <Cell key={datum.name} fill={datum.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="font-mono text-xl font-semibold tracking-tight leading-tight">
            {formatTokens(totalTokens)}
          </p>
          <p className="text-[11px] text-muted-foreground">tokens</p>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        {data.length > 0 ? (
          data.map((datum) => (
            <div
              key={datum.name}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: datum.color }}
                />
                <span className="truncate">{datum.name}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2 font-mono">
                <span className="text-muted-foreground">
                  {total > 0 ? `${Math.round((datum.value / total) * 100)}%` : "0%"}
                </span>
                <span className="w-12 text-right">{formatTokens(datum.value)}</span>
              </span>
            </div>
          ))
        ) : (
          <p className="py-2 text-center text-xs text-muted-foreground">
            No token usage in this window yet.
          </p>
        )}
      </div>
    </ChartCard>
  )
}
