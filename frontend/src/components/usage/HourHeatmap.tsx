import { useMemo } from "react"
import type { EChartsCoreOption } from "echarts/core"

import {
  HEATMAP_DAYS,
  HEATMAP_HOURS,
  buildHourHeatmap,
  formatTokens,
} from "@/lib/usage-data"
import type { UsageRecord } from "@/lib/types"
import { EChart } from "./EChart"
import { ChartCard } from "./chart-primitives"
import { resolveChartTheme, useResolvedTheme } from "./use-resolved-theme"

export function HourHeatmap({ records }: { records: UsageRecord[] }) {
  const dark = useResolvedTheme()
  const cells = useMemo(() => buildHourHeatmap(records), [records])
  const palette = resolveChartTheme(dark)

  const option = useMemo<EChartsCoreOption>(() => {
    const maxCount = cells.reduce((max, cell) => Math.max(max, cell.count), 0)
    const meta = new Map(cells.map((cell) => [`${cell.day}-${cell.hour}`, cell]))
    const data = cells.map((cell) => [cell.hour, cell.day, cell.count])
    const splitColor = dark
      ? ["rgba(255, 255, 255, 0.02)", "rgba(255, 255, 255, 0.05)"]
      : ["rgba(0, 0, 0, 0.02)", "rgba(0, 0, 0, 0.045)"]
    return {
      tooltip: {
        position: "top",
        backgroundColor: palette.card,
        borderColor: palette.grid,
        textStyle: { color: palette.text, fontSize: 12 },
        formatter: (params: { data?: unknown }) => {
          const row = params.data as [number, number, number]
          const cell = meta.get(`${row[1]}-${row[0]}`)
          const day = HEATMAP_DAYS[row[1]] ?? ""
          const hourLabel = `${String(row[0]).padStart(2, "0")}:00`
          if (!cell || cell.count === 0) {
            return `${day} · ${hourLabel}<br/>No requests`
          }
          return `${day} · ${hourLabel}<br/>${cell.count} requests · ${formatTokens(cell.tokens)} tokens`
        },
      },
      grid: { left: 46, right: 12, top: 8, bottom: 64 },
      xAxis: {
        type: "category",
        data: HEATMAP_HOURS,
        splitArea: { show: true, interval: 0, color: splitColor },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: palette.muted, fontSize: 10, interval: 1 },
      },
      yAxis: {
        type: "category",
        data: [...HEATMAP_DAYS],
        splitArea: { show: true, color: splitColor },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: palette.muted, fontSize: 10 },
      },
      visualMap: {
        min: 0,
        max: Math.max(maxCount, 1),
        calculable: false,
        orient: "horizontal",
        left: "center",
        bottom: 8,
        itemWidth: 150,
        itemHeight: 12,
        text: ["high", "low"],
        textStyle: { color: palette.muted, fontSize: 10 },
        inRange: {
          color: [
            "rgba(245, 158, 11, 0.12)",
            "rgba(245, 158, 11, 0.55)",
            "#f59e0b",
            "#b45309",
          ],
        },
      },
      series: [
        {
          type: "heatmap",
          data,
          label: { show: false },
          itemStyle: {
            borderColor: palette.card,
            borderWidth: 2,
            borderRadius: 3,
          },
          emphasis: {
            itemStyle: { shadowBlur: 8, shadowColor: "rgba(0, 0, 0, 0.3)" },
          },
        },
      ],
    }
  }, [cells, dark, palette])

  return (
    <ChartCard
      title="Usage heatmap"
      subtitle="Request count by hour and weekday"
      contentClassName="pt-2"
    >
      <EChart
        option={option}
        className="h-64 w-full"
        ariaLabel="Usage heatmap of requests by hour of day and day of week"
      />
    </ChartCard>
  )
}
