import { useMemo } from "react"
import type { EChartsCoreOption } from "echarts/core"

import {
  buildRoutingSankey,
  chartPalette,
  type SankeyNode,
} from "@/lib/usage-data"
import type { UsageRecord } from "@/lib/types"
import { EChart } from "./EChart"
import { ChartCard } from "./chart-primitives"
import { resolveChartTheme, useResolvedTheme } from "./use-resolved-theme"

export function RoutingSankey({ records }: { records: UsageRecord[] }) {
  const dark = useResolvedTheme()
  const isDark = dark === "dark"
  const palette = resolveChartTheme(dark)
  const clientColor = isDark ? "#d95926" : "#eb6834"
  const chartColors = chartPalette(isDark)
  const { nodes, links } = useMemo(() => buildRoutingSankey(records), [records])

  const option = useMemo<EChartsCoreOption>(() => {
    const displayMap = new Map(nodes.map((node) => [node.name, node.display]))
    const categoryIndex: Record<number, number> = { 0: 0, 1: 0, 2: 0 }
    const nodeColor = (node: SankeyNode): string => {
      if (node.category === 0) return clientColor
      const index = categoryIndex[node.category]++
      return chartColors[(index + (node.category - 1) * 3) % chartColors.length]
    }
    return {
      tooltip: {
        trigger: "item",
        triggerOn: "mousemove",
        backgroundColor: palette.card,
        borderColor: palette.grid,
        textStyle: { color: palette.text, fontSize: 12 },
      },
      series: [
        {
          type: "sankey",
          left: 8,
          right: 110,
          top: 12,
          bottom: 8,
          nodeWidth: 12,
          nodeGap: 14,
          layoutIterations: 32,
          data: nodes.map((node) => ({
            name: node.name,
            itemStyle: { color: nodeColor(node) },
          })),
          links,
          emphasis: { focus: "adjacency" },
          lineStyle: { color: "gradient", curveness: 0.5, opacity: 0.35 },
          label: {
            show: true,
            color: palette.text,
            fontSize: 11,
            formatter: (params: { name?: string | number }) =>
              displayMap.get(String(params.name)) ?? String(params.name),
          },
        },
      ],
    }
  }, [nodes, links, palette, clientColor, chartColors])

  const legend = [
    { label: "Client protocol", color: clientColor },
    { label: "Gateway model", color: chartColors[0] },
    { label: "Provider", color: chartColors[3] },
  ]

  return (
    <ChartCard
      title="Routing flow"
      subtitle="Client → gateway model → provider"
      className="h-full"
      contentClassName="flex flex-col"
    >
      {nodes.length > 0 ? (
        <>
          <EChart
            option={option}
            className="h-72 w-full"
            ariaLabel="Request routing flow from client protocol through gateway models to providers"
          />
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            {legend.map((item) => (
              <span
                key={item.label}
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                {item.label}
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No requests in this window yet.
        </p>
      )}
    </ChartCard>
  )
}
