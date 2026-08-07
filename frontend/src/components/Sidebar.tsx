import { cn } from "@/lib/utils"
import type { AdminConfig } from "@/lib/types"

import { VIEW_GROUPS } from "../App"

interface SidebarProps {
  config: AdminConfig
  activeView: string
  onSelectView: (view: string) => void
}

export function Sidebar({ config, activeView, onSelectView }: SidebarProps) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-3 px-6 py-5">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">
          FC
        </div>
        <div>
          <h1 className="text-base font-semibold leading-tight">Free Claude Code</h1>
          <p className="text-xs text-muted-foreground">Server Control</p>
        </div>
      </div>
      <nav className="flex flex-col gap-1 px-3" aria-label="Admin views">
        {VIEW_GROUPS.map((view) => (
          <button
            key={view.id}
            type="button"
            className={cn(
              "rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
              view.id === activeView
                ? "bg-accent text-accent-foreground"
                : "hover:bg-accent/50",
            )}
            aria-current={view.id === activeView ? "page" : undefined}
            onClick={() => onSelectView(view.id)}
          >
            {view.label}
          </button>
        ))}
      </nav>
      <div className="mt-auto px-6 py-4 text-xs text-muted-foreground">
        <p className="break-all">{config.paths.managed}</p>
      </div>
    </aside>
  )
}