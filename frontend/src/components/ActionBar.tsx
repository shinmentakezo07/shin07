import { CheckCircle2, CircleAlert, Loader2, Play, ShieldCheck, TriangleAlert, XCircle } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"

interface ActionBarProps {
  configPath: string
  dirtyCount: number
  message: { text: string; kind?: string } | null
  applying: boolean
  onValidate: () => void
  onApply: () => void
}

function messageIcon(kind?: string) {
  switch (kind) {
    case "error":
      return <XCircle className="size-4 shrink-0 text-destructive" />
    case "warn":
      return <TriangleAlert className="size-4 shrink-0 text-amber-600" />
    case "ok":
      return <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
    default:
      return null
  }
}

export function ActionBar({
  configPath,
  dirtyCount,
  message,
  applying,
  onValidate,
  onApply,
}: ActionBarProps) {
  return (
    <footer className="sticky bottom-0 z-30 flex flex-wrap items-center gap-x-4 gap-y-2 border-t bg-background/90 px-4 py-3 backdrop-blur-md md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Badge
          variant={dirtyCount === 0 ? "outline" : "warn"}
          className={cn(
            "shrink-0 gap-1.5",
            dirtyCount === 0 && "text-muted-foreground",
          )}
        >
          {dirtyCount === 0 ? (
            <CheckCircle2 className="size-3.5 text-emerald-500" />
          ) : (
            <CircleAlert className="size-3.5" />
          )}
          {dirtyCount === 0
            ? "No changes"
            : `${dirtyCount} unsaved change${dirtyCount === 1 ? "" : "s"}`}
        </Badge>
        <span className="hidden min-w-0 truncate font-mono text-xs text-muted-foreground lg:inline">
          {configPath}
        </span>
      </div>
      <div
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 text-sm",
          message?.kind === "error" && "text-destructive",
          message?.kind === "warn" && "text-amber-600",
          message?.kind === "ok" && "text-emerald-600",
        )}
        role={message?.kind === "error" ? "alert" : undefined}
        aria-live="polite"
      >
        {messageIcon(message?.kind)}
        <span className="truncate">{message?.text ?? ""}</span>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="secondary" onClick={onValidate} disabled={applying}>
          <ShieldCheck />
          Validate
        </Button>
        <Button onClick={onApply} disabled={dirtyCount === 0 || applying}>
          {applying ? <Loader2 className="animate-spin" /> : <Play />}
          {applying ? "Applying..." : "Apply"}
        </Button>
      </div>
    </footer>
  )
}
