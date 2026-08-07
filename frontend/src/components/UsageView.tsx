import { useEffect, useState } from "react"
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  XCircle,
} from "lucide-react"

import { errorMessage } from "@/App"
import { fetchUsageStats } from "@/lib/api"
import type { UsageRecord, UsageResult } from "@/lib/types"
import {
  RANGES,
  buildBuckets,
  computeKpis,
  filterByRange,
  formatDuration,
  formatShortTime,
  formatTimestamp,
  type RangeKey,
} from "@/lib/usage-data"
import { cn } from "@/lib/utils"
import { HourHeatmap } from "./usage/HourHeatmap"
import { KpiCards } from "./usage/KpiCards"
import { RoutingSankey } from "./usage/RoutingSankey"
import { TokenDonut } from "./usage/TokenDonut"
import { TopEndpoints } from "./usage/TopEndpoints"
import { VolumeAreaChart } from "./usage/VolumeAreaChart"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"
import { Skeleton } from "./ui/skeleton"

const REFRESH_INTERVAL_MS = 10_000

const PAGE_SIZES = [10, 25, 50] as const

/** Compact page-number list with ellipses for large logs (1 … 3 4 5 … 40). */
function pageList(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)
  const pages: (number | "…")[] = [1]
  if (current > 3) pages.push("…")
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
    pages.push(pageNumber)
  }
  if (current < total - 2) pages.push("…")
  pages.push(total)
  return pages
}

const STATUS_VARIANT = {
  success: "ok",
  error: "error",
  cancelled: "neutral",
} as const

const STATUS_ICON = {
  success: <CheckCircle2 className="size-3.5" />,
  error: <XCircle className="size-3.5" />,
  cancelled: <AlertTriangle className="size-3.5" />,
} as const

function statusLabel(status: UsageRecord["status"]): string {
  return status === "cancelled" ? "Cancelled" : status === "error" ? "Error" : "Success"
}

function RangeSelector({
  value,
  onChange,
}: {
  value: RangeKey
  onChange: (range: RangeKey) => void
}) {
  return (
    <div
      className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1"
      role="group"
      aria-label="Time range"
    >
      {RANGES.map((option) => (
        <button
          key={option.key}
          type="button"
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            value === option.key
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onChange(option.key)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function UsageView() {
  const [data, setData] = useState<UsageResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [range, setRange] = useState<RangeKey>("1h")
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const refresh = async () => {
    try {
      const result = await fetchUsageStats()
      setData(result)
      setError(null)
      setUpdatedAt(Date.now() / 1000)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => {
      void refresh()
    }, REFRESH_INTERVAL_MS)
    return () => clearInterval(timer)
    // The interval deliberately captures the initial refresh closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const records = data?.records ?? []
  const now = Date.now() / 1000
  const filtered = filterByRange(records, range, now)
  const buckets = buildBuckets(filtered, now)
  const kpis = computeKpis(filtered, now)

  // The request log is paginated; the page clamps when a refresh shrinks it.
  const totalPages = Math.max(1, Math.ceil(records.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * pageSize
  const pageRecords = records.slice(pageStart, pageStart + pageSize)
  const showingStart = records.length === 0 ? 0 : pageStart + 1
  const showingEnd = Math.min(records.length, pageStart + pageSize)

  if (loading && !data) {
    return (
      <section className="space-y-4" aria-label="Usage statistics">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-32 w-full" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-80 w-full lg:col-span-2" />
        </div>
        <Skeleton className="h-72 w-full" />
      </section>
    )
  }

  if (error && !data) {
    return (
      <section className="space-y-4" aria-label="Usage statistics">
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-500/15">
              <AlertTriangle className="size-6" />
            </span>
            <p className="text-sm text-muted-foreground">
              Could not load usage statistics: {error}
            </p>
            <Button type="button" variant="secondary" onClick={() => void refresh()}>
              <RefreshCw />
              Retry
            </Button>
          </CardContent>
        </Card>
      </section>
    )
  }

  const statusSummary = {
    success: records.reduce(
      (sum, record) => sum + (record.status === "success" ? 1 : 0),
      0,
    ),
    error: records.reduce(
      (sum, record) => sum + (record.status === "error" ? 1 : 0),
      0,
    ),
    cancelled: records.reduce(
      (sum, record) => sum + (record.status === "cancelled" ? 1 : 0),
      0,
    ),
  }

  return (
    <section className="space-y-5" aria-label="Usage statistics">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold">Usage</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Token throughput and request routing for the gateway, refreshed
            automatically every 10 seconds. Full prompts are captured for each
            request (capped at 64 KB) in <code>~/.fcc/usage.json</code>.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <RangeSelector value={range} onChange={setRange} />
            <Button type="button" variant="secondary" size="sm" onClick={() => void refresh()}>
              <RefreshCw />
              Refresh
            </Button>
          </div>
          {updatedAt !== null ? (
            <p className="text-[11px] text-muted-foreground">
              Updated {formatShortTime(updatedAt)}
            </p>
          ) : null}
        </div>
      </div>

      {records.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10">
              <Activity className="size-6 text-primary" />
            </span>
            <p className="text-sm text-muted-foreground">
              No requests tracked yet. Send a request through the proxy and it will
              appear here.
            </p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10">
              <Activity className="size-6 text-primary" />
            </span>
            <p className="text-sm text-muted-foreground">
              No requests in the selected window. Try a wider range.
            </p>
            <Button type="button" variant="secondary" onClick={() => setRange("all")}>
              Show all requests
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <KpiCards kpis={kpis} buckets={buckets} />

          <div className="grid gap-4 lg:grid-cols-3">
            <TokenDonut kpis={kpis} />
            <div className="lg:col-span-2">
              <VolumeAreaChart buckets={buckets} />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <TopEndpoints records={filtered} />
            <RoutingSankey records={filtered} />
          </div>

          <HourHeatmap records={filtered} />
        </>
      )}

      <Card className="gap-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
          <div>
            <h4 className="text-sm font-semibold">Recent requests</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {records.length} tracked · newest first
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="ok" className="gap-1 font-normal">
              {STATUS_ICON.success}
              {statusSummary.success}
            </Badge>
            <Badge variant="error" className="gap-1 font-normal">
              {STATUS_ICON.error}
              {statusSummary.error}
            </Badge>
            <Badge variant="neutral" className="gap-1 font-normal">
              {STATUS_ICON.cancelled}
              {statusSummary.cancelled}
            </Badge>
          </div>
        </div>
        <CardContent className="px-0 py-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th className="w-8 px-3 py-2.5" />
                  <th className="px-3 py-2.5 font-medium">Time</th>
                  <th className="px-3 py-2.5 font-medium">Provider / Model</th>
                  <th className="px-3 py-2.5 text-right font-medium">Input</th>
                  <th className="px-3 py-2.5 text-right font-medium">Output</th>
                  <th className="px-3 py-2.5 text-right font-medium">Cache</th>
                  <th className="px-3 py-2.5 text-right font-medium">Reasoning</th>
                  <th className="px-3 py-2.5 text-right font-medium">Duration</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {pageRecords.map((record) => {
                  const expanded = record.request_id === expandedId
                  const cacheTokens =
                    record.cache_creation_tokens + record.cache_read_tokens
                  return (
                    <UsageRow
                      key={record.request_id}
                      record={record}
                      expanded={expanded}
                      cacheTokens={cacheTokens}
                      onToggle={() =>
                        setExpandedId(expanded ? null : record.request_id)
                      }
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
          {records.length > pageSize ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Showing{" "}
                <span className="font-mono">
                  {showingStart}–{showingEnd}
                </span>{" "}
                of <span className="font-mono">{records.length}</span>
              </p>
              <nav
                className="flex flex-wrap items-center gap-1"
                aria-label="Request log pages"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="px-1.5"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                {pageList(currentPage, totalPages).map((entry, index) =>
                  entry === "…" ? (
                    <span
                      key={`ellipsis-${index}`}
                      className="px-0.5 text-xs text-muted-foreground"
                    >
                      …
                    </span>
                  ) : (
                    <Button
                      key={entry}
                      type="button"
                      size="sm"
                      variant={entry === currentPage ? "default" : "ghost"}
                      className="min-w-7 px-1.5"
                      aria-current={entry === currentPage ? "page" : undefined}
                      onClick={() => setPage(entry)}
                    >
                      {entry}
                    </Button>
                  ),
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="px-1.5"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                  aria-label="Next page"
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </nav>
              <div
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
                role="group"
                aria-label="Rows per page"
              >
                <span className="hidden sm:inline">Per page</span>
                <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-0.5">
                  {PAGE_SIZES.map((size) => (
                    <button
                      key={size}
                      type="button"
                      className={cn(
                        "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                        pageSize === size
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      onClick={() => {
                        setPageSize(size)
                        setPage(1)
                      }}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  )
}

interface UsageRowProps {
  record: UsageRecord
  expanded: boolean
  cacheTokens: number
  onToggle: () => void
}

function UsageRow({ record, expanded, cacheTokens, onToggle }: UsageRowProps) {
  const modelLabel = record.gateway_model || record.provider_model
  const cacheRead = record.cache_read_tokens
  const cacheCreation = record.cache_creation_tokens
  return (
    <>
      <tr
        className={cn(
          "cursor-pointer border-b transition-colors hover:bg-accent/40",
          expanded && "bg-accent/30",
        )}
        onClick={onToggle}
      >
        <td className="px-3 py-2.5">
          {expanded ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" />
          )}
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
          {formatTimestamp(record.timestamp)}
        </td>
        <td className="max-w-64 px-3 py-2.5">
          <p className="truncate font-mono text-xs">{modelLabel}</p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {record.provider}
            {record.provider_model && record.provider_model !== modelLabel
              ? ` → ${record.provider_model}`
              : ""}
          </p>
        </td>
        <td className="px-3 py-2.5 text-right font-mono text-xs">
          {record.input_tokens}
        </td>
        <td className="px-3 py-2.5 text-right font-mono text-xs">
          {record.output_tokens}
        </td>
        <td className="px-3 py-2.5 text-right font-mono text-xs">
          {cacheTokens > 0 ? (
            <span
              title={`${cacheCreation} created · ${cacheRead} read`}
              className="cursor-help"
            >
              {cacheTokens}
            </span>
          ) : (
            <span className="text-muted-foreground/50">–</span>
          )}
        </td>
        <td className="px-3 py-2.5 text-right font-mono text-xs">
          {record.reasoning_tokens > 0 ? (
            record.reasoning_tokens
          ) : (
            <span className="text-muted-foreground/50">–</span>
          )}
        </td>
        <td className="px-3 py-2.5 text-right font-mono text-xs">
          {formatDuration(record.duration_ms)}
        </td>
        <td className="px-3 py-2.5">
          <Badge variant={STATUS_VARIANT[record.status]} className="gap-1 font-normal">
            {STATUS_ICON[record.status]}
            {statusLabel(record.status)}
          </Badge>
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b bg-muted/20">
          <td colSpan={9} className="px-3 py-3">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="gap-1.5 font-normal">
                  {record.wire_api}
                </Badge>
                {record.error_type ? (
                  <Badge variant="error" className="gap-1.5 font-normal">
                    {record.error_type}
                  </Badge>
                ) : null}
                <span className="font-mono">{record.request_id}</span>
              </div>
              <pre className="max-h-64 overflow-auto rounded-md border bg-background/70 p-3 font-mono text-xs whitespace-pre-wrap text-foreground/90">
                {record.prompt || "(no prompt captured)"}
              </pre>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  )
}
