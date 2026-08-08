import { useMemo, useState, type ReactNode } from "react"
import type { EChartsCoreOption } from "echarts/core"

import {
  HEATMAP_DAYS,
  HEATMAP_EMPTY_DARK,
  HEATMAP_EMPTY_LIGHT,
  HEATMAP_HOURS,
  HEATMAP_LABEL_ON_LIGHT,
  HEATMAP_LEVEL_COLORS_DARK,
  HEATMAP_LEVEL_COLORS_LIGHT,
  HEATMAP_PEAK_RING_DARK,
  HEATMAP_PEAK_RING_LIGHT,
  buildHourHeatmap,
  formatDuration,
  formatTokens,
  type HeatmapCell,
} from "@/lib/usage-data"
import type { UsageRecord } from "@/lib/types"
import { cn } from "@/lib/utils"
import { EChart } from "./EChart"
import { ChartCard } from "./chart-primitives"
import { resolveChartTheme, useResolvedTheme } from "./use-resolved-theme"

type Metric = "requests" | "tokens"

const METRICS: { key: Metric; label: string }[] = [
  { key: "requests", label: "Requests" },
  { key: "tokens", label: "Tokens" },
]

function valueOf(cell: HeatmapCell, metric: Metric): number {
  return metric === "tokens" ? cell.tokens : cell.count
}

function labelText(value: number, metric: Metric): string {
  return metric === "tokens" ? formatTokens(value) : String(value)
}

function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

/** Compact clock labels at 6h intervals (12a, 6a, 12p, 6p). */
function hourTickLabel(value: string | number): string {
  const hour = Number(value)
  if (Number.isNaN(hour) || hour % 6 !== 0) return ""
  if (hour === 0) return "12a"
  if (hour === 12) return "12p"
  return hour < 12 ? `${hour}a` : `${hour - 12}p`
}

function SummaryChip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 font-mono text-[11px] text-muted-foreground">
      <span className="font-sans font-medium text-foreground">{label}</span>
      {children}
    </span>
  )
}

export function HourHeatmap({ records }: { records: UsageRecord[] }) {
  const dark = useResolvedTheme()
  const isDark = dark === "dark"
  const [metric, setMetric] = useState<Metric>("requests")
  const cells = useMemo(() => buildHourHeatmap(records), [records])
  const palette = resolveChartTheme(dark)
  const levels = isDark ? HEATMAP_LEVEL_COLORS_DARK : HEATMAP_LEVEL_COLORS_LIGHT
  const emptyColor = isDark ? HEATMAP_EMPTY_DARK : HEATMAP_EMPTY_LIGHT

  const summary = useMemo(() => {
    const dayCounts = Array.from({ length: 7 }, () => 0)
    const hourCounts = Array.from({ length: 24 }, () => 0)
    const dayTokens = Array.from({ length: 7 }, () => 0)
    const hourTokens = Array.from({ length: 24 }, () => 0)
    for (const cell of cells) {
      dayCounts[cell.day] += cell.count
      hourCounts[cell.hour] += cell.count
      dayTokens[cell.day] += cell.tokens
      hourTokens[cell.hour] += cell.tokens
    }
    const argmax = (values: number[]) =>
      values.reduce((best, value, index) => (value > values[best] ? index : best), 0)
    const peak = cells.reduce<HeatmapCell | null>(
      (best, cell) =>
        best === null || valueOf(cell, metric) > valueOf(best, metric) ? cell : best,
      null,
    )
    const values = cells.map((cell) => valueOf(cell, metric)).sort((a, b) => a - b)
    const total = values.reduce((sum, value) => sum + value, 0)
    const midLow = values[Math.floor((values.length - 1) / 2)] ?? 0
    const midHigh = values[Math.ceil((values.length - 1) / 2)] ?? 0
    return {
      peak,
      busiestDay: argmax(dayCounts),
      busiestHour: argmax(hourCounts),
      dayValues: metric === "tokens" ? dayTokens : dayCounts,
      hourValues: metric === "tokens" ? hourTokens : hourCounts,
      activeHours: values.filter((value) => value > 0).length,
      avgPerHour: values.length > 0 ? total / values.length : 0,
      medianPerHour: (midLow + midHigh) / 2,
    }
  }, [cells, metric])

  const option = useMemo<EChartsCoreOption>(() => {
    const maxValue = Math.max(1, ...cells.map((cell) => valueOf(cell, metric)))
    // Quartile breaks over the peak give a GitHub-style leveled scale that
    // stays readable even with sparse data.
    const q1 = Math.max(1, Math.ceil(maxValue / 4))
    const q2 = Math.max(1, Math.ceil(maxValue / 2))
    const q3 = Math.max(1, Math.ceil((maxValue * 3) / 4))
    const levelColor = (value: number): string => {
      if (value <= 0) return emptyColor
      if (value <= q1) return levels[0]
      if (value <= q2) return levels[1]
      if (value <= q3) return levels[2]
      return levels[3]
    }
    const peakRing = isDark ? HEATMAP_PEAK_RING_DARK : HEATMAP_PEAK_RING_LIGHT
    const splitColor = isDark
      ? ["rgba(255, 255, 255, 0.02)", "rgba(255, 255, 255, 0.05)"]
      : ["rgba(0, 0, 0, 0.02)", "rgba(0, 0, 0, 0.045)"]
    const meta = new Map(cells.map((cell) => [`${cell.day}-${cell.hour}`, cell]))
    const peak = summary.peak
    const weekTotal = cells.reduce((sum, cell) => sum + valueOf(cell, metric), 0)
    const data = cells.map((cell) => {
      const value = valueOf(cell, metric)
      const isPeak = value > 0 && value === maxValue && cell === peak
      return {
        value: [cell.hour, cell.day, value],
        ...(isPeak
          ? { itemStyle: { borderColor: peakRing, borderWidth: 2.5 } }
          : {}),
        label:
          value > 0
            ? {
                color: isDark
                  ? "#ffffff"
                  : value > q2
                    ? "#ffffff"
                    : HEATMAP_LABEL_ON_LIGHT,
              }
            : { show: false },
      }
    })
    const row = (label: string, value: string) =>
      `<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:${palette.muted}">${label}</span><span style="color:${palette.text};font-family:ui-monospace,monospace">${value}</span></div>`
    return {
      tooltip: {
        position: "top",
        confine: true,
        extraCssText:
          "border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.18);padding:8px 10px",
        backgroundColor: palette.card,
        borderColor: palette.grid,
        textStyle: { color: palette.text, fontSize: 12 },
        formatter: (params: { data?: { value?: [number, number, number] } }) => {
          const rowData = params.data?.value
          if (!rowData) return ""
          const [hour, day, value] = rowData
          const cell = meta.get(`${day}-${hour}`)
          const dayName = HEATMAP_DAYS[day] ?? ""
          const dot = `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${levelColor(value)};margin-right:6px;vertical-align:middle"></span>`
          const header = `<div style="font-weight:600;margin-bottom:4px;padding-bottom:4px;border-bottom:1px solid ${palette.grid}">${dot}${dayName} · ${pad2(hour)}:00</div>`
          if (!cell || cell.count === 0) {
            return `${header}<div style="color:${palette.muted}">No requests</div>`
          }
          const pctPeak = maxValue > 0 ? Math.round((value / maxValue) * 100) : 0
          const pctWeek = weekTotal > 0 ? Math.round((value / weekTotal) * 100) : 0
          const avgLatency =
            cell.latencyCount > 0 ? cell.latencySum / cell.latencyCount : 0
          return (
            header +
            row("Requests", String(cell.count)) +
            row("Tokens", formatTokens(cell.tokens)) +
            row("Share of peak", `${pctPeak}%`) +
            row("Share of week", `${pctWeek}%`) +
            row("Avg latency", formatDuration(avgLatency))
          )
        },
      },
      grid: { left: 50, right: 16, top: 10, bottom: 8 },
      xAxis: {
        type: "category",
        data: HEATMAP_HOURS,
        splitArea: { show: true, interval: 0, color: splitColor },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: palette.muted,
          fontSize: 10,
          interval: 0,
          formatter: hourTickLabel,
        },
      },
      yAxis: {
        type: "category",
        data: [...HEATMAP_DAYS],
        splitArea: { show: true, color: splitColor },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: palette.muted,
          fontSize: 10,
          formatter: (value: string) =>
            value === "Sat" || value === "Sun" ? `{wk|${value}}` : value,
          rich: { wk: { color: palette.text, fontWeight: 600 } },
        },
      },
      // The heatmap series colors through visualMap; the UI stays hidden and
      // a custom Less/More legend renders below the chart instead.
      visualMap: {
        show: false,
        seriesIndex: 0,
        min: 0,
        max: maxValue,
        pieces: [
          { lte: 0, color: emptyColor },
          { gt: 0, lte: q1, color: levels[0] },
          { gt: q1, lte: q2, color: levels[1] },
          { gt: q2, lte: q3, color: levels[2] },
          { gt: q3, color: levels[3] },
        ],
      },
      series: [
        {
          type: "heatmap",
          data,
          label: {
            show: true,
            fontSize: 9,
            fontWeight: 600,
            color: "#ffffff",
            formatter: (params: { value?: unknown }) => {
              const valueRow = params.value as [number, number, number] | undefined
              const value = valueRow?.[2] ?? 0
              return value > 0 ? labelText(value, metric) : ""
            },
          },
          itemStyle: {
            borderColor: palette.card,
            borderWidth: 2,
            borderRadius: 3,
          },
          // Subtle band across weekend rows so Sat/Sun read as a block.
          markArea: {
            silent: true,
            itemStyle: {
              color: isDark ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.035)",
            },
            data: [[{ yAxis: "Sat" }, { yAxis: "Sun" }]],
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: "rgba(0, 0, 0, 0.35)",
              borderColor: palette.text,
              borderWidth: 1.5,
            },
          },
        },
      ],
    }
  }, [cells, dark, metric, palette, summary, levels])

  const totalActivity = cells.reduce((sum, cell) => sum + cell.count, 0)

  return (
    <ChartCard
      title="Usage heatmap"
      subtitle={
        metric === "requests"
          ? "Request count by hour and weekday"
          : "Token volume by hour and weekday"
      }
      className="h-full"
      actions={
        <div
          className="flex items-center gap-1 rounded-lg border bg-muted/40 p-0.5"
          role="group"
          aria-label="Heatmap metric"
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
      contentClassName="pt-2"
    >
      <EChart
        option={option}
        className="h-60 w-full"
        ariaLabel={`Usage heatmap of ${metric} by hour of day and day of week`}
      />
      <div className="mt-1.5 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="mr-0.5">Less</span>
        {[emptyColor, ...levels].map((color, index) => (
          <span
            key={`${color}-${index}`}
            className="size-2.5 rounded-[3px]"
            style={{ backgroundColor: color }}
          />
        ))}
        <span className="ml-0.5">More</span>
      </div>
      {summary.peak !== null && totalActivity > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <SummaryChip label="Peak">
            {labelText(valueOf(summary.peak, metric), metric)} ·{" "}
            {HEATMAP_DAYS[summary.peak.day]} {pad2(summary.peak.hour)}:00
          </SummaryChip>
          <SummaryChip label="Busiest day">
            {HEATMAP_DAYS[summary.busiestDay]} ·{" "}
            {labelText(summary.dayValues[summary.busiestDay], metric)}
          </SummaryChip>
          <SummaryChip label="Busiest hour">
            {pad2(summary.busiestHour)}:00 ·{" "}
            {labelText(summary.hourValues[summary.busiestHour], metric)}
          </SummaryChip>
          <SummaryChip label="Active hours">
            {summary.activeHours}/168
          </SummaryChip>
          <SummaryChip label="Avg / hour">
            {labelText(summary.avgPerHour, metric)}
          </SummaryChip>
          <SummaryChip label="Median / hour">
            {labelText(summary.medianPerHour, metric)}
          </SummaryChip>
        </div>
      ) : null}
    </ChartCard>
  )
}
