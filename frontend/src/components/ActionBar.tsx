import { cn } from "@/lib/utils"
import { Button } from "./ui/button"

interface ActionBarProps {
  configPath: string
  dirtyCount: number
  message: { text: string; kind?: string } | null
  applying: boolean
  onValidate: () => void
  onApply: () => void
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
    <footer className="flex items-center gap-4 border-t px-6 py-3">
      <div className="flex min-w-0 items-center gap-4">
        <strong className="shrink-0 text-sm">
          {dirtyCount === 0 ? "No changes" : `${dirtyCount} unsaved change${dirtyCount === 1 ? "" : "s"}`}
        </strong>
        <span className="truncate text-xs text-muted-foreground">{configPath}</span>
      </div>
      <div
        className={cn(
          "min-w-0 flex-1 truncate text-sm",
          message?.kind === "error" && "text-destructive",
          message?.kind === "warn" && "text-amber-600",
          message?.kind === "ok" && "text-emerald-600",
        )}
      >
        {message?.text ?? ""}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="secondary" onClick={onValidate}>
          Validate
        </Button>
        <Button onClick={onApply} disabled={dirtyCount === 0 || applying}>
          {applying ? "Applying..." : "Apply"}
        </Button>
      </div>
    </footer>
  )
}