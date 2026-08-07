import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import { Card, CardContent } from "../ui/card"

export function ChartCard({
  title,
  subtitle,
  actions,
  children,
  className,
  contentClassName,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
}) {
  return (
    <Card className={cn("gap-0 overflow-hidden", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold">{title}</h4>
          {subtitle ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {actions}
      </div>
      <CardContent className={cn("px-4 py-4", contentClassName)}>{children}</CardContent>
    </Card>
  )
}

interface ChartTooltipEntry {
  name?: string | number
  value?: unknown
  color?: string
  payload?: { color?: string; name?: string; value?: unknown }
}

export interface ChartTooltipProps {
  active?: boolean
  label?: string | number
  payload?: ReadonlyArray<ChartTooltipEntry>
  formatter?: (value: number, name: string) => string
}

export function ChartTooltip({ active, label, payload, formatter }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      {label !== undefined && label !== "" ? (
        <p className="mb-1 font-medium text-popover-foreground">{label}</p>
      ) : null}
      <div className="space-y-0.5">
        {payload.map((entry, index) => {
          const name = String(entry.name ?? "")
          const value = Number(entry.value ?? 0)
          const color = entry.color ?? entry.payload?.color ?? "var(--ring)"
          const text = formatter ? formatter(value, name) : String(value)
          return (
            <p
              key={`${name}-${index}`}
              className="flex items-center justify-between gap-4 text-muted-foreground"
            >
              <span className="flex items-center gap-1.5">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                {name}
              </span>
              <span className="font-mono text-popover-foreground">{text}</span>
            </p>
          )
        })}
      </div>
    </div>
  )
}
