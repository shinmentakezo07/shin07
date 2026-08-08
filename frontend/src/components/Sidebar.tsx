import { Bot, FileCog } from "lucide-react"

import { cn } from "@/lib/utils"
import type { AdminConfig } from "@/lib/types"

import { VIEW_GROUPS } from "../App"
import { Separator } from "./ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip"

interface SidebarProps {
  config: AdminConfig
  activeView: string
  onSelectView: (view: string) => void
  /** Called after a view is selected; used by the mobile drawer to close. */
  onNavigate?: () => void
  className?: string
}

export function Sidebar({
  config,
  activeView,
  onSelectView,
  onNavigate,
  className,
}: SidebarProps) {
  return (
    <aside
      className={cn(
        "flex w-64 shrink-0 flex-col overflow-y-auto border-r bg-sidebar text-sidebar-foreground",
        className,
      )}
    >
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-sm ring-1 ring-border/40">
          <Bot className="size-5" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-sm leading-tight font-semibold tracking-tight">
            Free Claude Code
          </h1>
          <p className="text-xs text-muted-foreground">Server Control</p>
        </div>
      </div>

      <div className="px-5 pt-1 pb-2 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        Configuration
      </div>

      <nav className="flex flex-col gap-1 px-3" aria-label="Admin views">
        {VIEW_GROUPS.map((view) => {
          const isActive = view.id === activeView
          const Icon = view.icon
          return (
            <Tooltip key={view.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground shadow-sm ring-1 ring-primary/20"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => {
                    onSelectView(view.id)
                    onNavigate?.()
                  }}
                >
                  <Icon
                    className={cn(
                      "size-4 shrink-0",
                      isActive ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  {view.label}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{view.description}</TooltipContent>
            </Tooltip>
          )
        })}
      </nav>

      <div className="mt-auto space-y-2 px-5 py-4">
        <Separator />
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <FileCog className="size-3.5 shrink-0" />
          Managed config
        </div>
        <p className="break-all rounded-md bg-muted/40 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground/80">
          {config.paths.managed}
        </p>
      </div>
    </aside>
  )
}
