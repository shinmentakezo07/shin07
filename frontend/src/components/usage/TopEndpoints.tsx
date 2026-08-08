import { useState } from "react"

import {
  buildTopByModel,
  buildTopByProvider,
  chartPalette,
  formatTokens,
  type EndpointUsage,
} from "@/lib/usage-data"
import { cn } from "@/lib/utils"
import type { UsageRecord } from "@/lib/types"
import { Badge } from "../ui/badge"
import { ChartCard } from "./chart-primitives"
import { useResolvedTheme } from "./use-resolved-theme"

type GroupBy = "model" | "provider"

const GROUP_OPTIONS: { key: GroupBy; label: string }[] = [
  { key: "model", label: "Model" },
  { key: "provider", label: "Provider" },
]

function BarListRow({ item, index, maxTokens }: { item: EndpointUsage; index: number; maxTokens: number }) {
  const dark = useResolvedTheme() === "dark"
  const color = chartPalette(dark)[index % 8]
  const share = maxTokens > 0 ? (item.tokens / maxTokens) * 100 : 0
  return (
    <li>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-center gap-2">
          <span className="w-4 shrink-0 text-right font-mono text-muted-foreground">
            {index + 1}
          </span>
          <span className="truncate font-mono">{item.name}</span>
          {item.errors > 0 ? (
            <Badge variant="error" className="px-1.5 py-0 text-[10px] font-medium">
              {item.errors} err
            </Badge>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-2 font-mono">
          <span className="text-muted-foreground">
            {item.requests} req
          </span>
          <span className="w-12 text-right">{formatTokens(item.tokens)}</span>
        </span>
      </div>
      <div className="mt-1 ml-6 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${share}%`, backgroundColor: color }}
        />
      </div>
    </li>
  )
}

export function TopEndpoints({ records }: { records: UsageRecord[] }) {
  const [groupBy, setGroupBy] = useState<GroupBy>("model")
  const items =
    groupBy === "model" ? buildTopByModel(records) : buildTopByProvider(records)
  const maxTokens = items.length > 0 ? items[0].tokens : 0
  return (
    <ChartCard
      title="Top endpoints"
      subtitle={
        groupBy === "model"
          ? "Gateway models ranked by token usage"
          : "Providers ranked by token usage"
      }
      className="h-full"
      actions={
        <div
          className="flex items-center gap-1 rounded-lg border bg-muted/40 p-0.5"
          role="group"
          aria-label="Group by"
        >
          {GROUP_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                groupBy === option.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setGroupBy(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      }
    >
      {items.length > 0 ? (
        <ol className="space-y-3">
          {items.map((item, index) => (
            <BarListRow
              key={`${groupBy}-${item.name}`}
              item={item}
              index={index}
              maxTokens={maxTokens}
            />
          ))}
        </ol>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No requests in this window yet.
        </p>
      )}
    </ChartCard>
  )
}
