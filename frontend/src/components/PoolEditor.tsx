import { useState } from "react"

import { fetchPoolKeys } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Button } from "./ui/button"
import { Input } from "./ui/input"

const POOL_TOKEN_RE = /^__fcc_key_(\d+)__$/
const MASKED_SECRET = "********"

interface PoolItem {
  token: string | null
  raw?: string
}

interface PoolEditorProps {
  value: string
  locked: boolean
  keyCount: number
  fieldKey: string
  disabled?: boolean
  onChange: (value: string) => void
  onMessage: (text: string, kind?: string) => void
}

function mask(raw: string): string {
  return "●".repeat(Math.min(24, Math.max(12, raw.length)))
}

function tokenIndex(token: string): number {
  const match = POOL_TOKEN_RE.exec(token)
  return match ? Number(match[1]) : -1
}

export function PoolEditor({
  value,
  locked,
  keyCount,
  fieldKey,
  disabled = false,
  onChange,
  onMessage,
}: PoolEditorProps) {
  const [items, setItems] = useState<PoolItem[]>(() =>
    (value || "").split(",").filter(Boolean).map((part) => ({ token: part })),
  )
  const [newKey, setNewKey] = useState("")
  const [rawKeys, setRawKeys] = useState<string[] | null>(null)
  const [revealIndex, setRevealIndex] = useState<number | null>(null)

  const sync = (next: PoolItem[]) => {
    setItems(next)
    onChange(next.map((item) => item.token || item.raw || "").join(","))
  }

  const addKey = () => {
    const raw = newKey.trim()
    if (!raw) return
    if (raw.includes(",")) {
      onMessage("API keys cannot contain commas.", "error")
      return
    }
    if (POOL_TOKEN_RE.test(raw)) {
      onMessage("This key format is reserved; enter a real API key.", "error")
      return
    }
    sync([...items, { token: null, raw }])
    setNewKey("")
  }

  const reveal = async (index: number) => {
    if (rawKeys === null) {
      try {
        const result = await fetchPoolKeys(fieldKey)
        setRawKeys(result.keys)
      } catch (error) {
        onMessage(error instanceof Error ? error.message : String(error), "error")
        return
      }
    }
    setRevealIndex((current) => (current === index ? null : index))
  }

  const displayedValue = (item: PoolItem, index: number): string => {
    if (revealIndex !== index) return item.token ? MASKED_SECRET : mask(item.raw ?? "")
    if (item.token) {
      const rawIndex = tokenIndex(item.token)
      return rawKeys && rawIndex >= 0 && rawIndex < rawKeys.length
        ? rawKeys[rawIndex]
        : MASKED_SECRET
    }
    return item.raw ?? ""
  }

  const editValue = (index: number, next: string) => {
    sync(
      items.map((item, itemIndex) => {
        if (itemIndex !== index) return item
        if (item.token) return { token: null, raw: next }
        return { ...item, raw: next }
      }),
    )
  }

  const hint =
    keyCount === 0
      ? "Add one or more API keys. Multiple keys rotate round-robin with failover."
      : keyCount === 1
        ? "One key configured. Add extra keys for round-robin and failover."
        : "Multiple keys are used in rotation. Add extra keys for round-robin and failover."

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        {items.map((item, index) => (
          <div
            key={index}
            className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5"
          >
            {revealIndex === index ? (
              <Input
                type="text"
                autoComplete="off"
                value={displayedValue(item, index)}
                disabled={locked || disabled}
                onChange={(event) => editValue(index, event.target.value)}
                onBlur={() => setRevealIndex(null)}
                className="h-8 flex-1 font-mono text-xs"
              />
            ) : (
              <span className="min-w-0 flex-1 break-all font-mono text-xs text-muted-foreground">
                {displayedValue(item, index)}
              </span>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={locked || disabled}
              aria-label={revealIndex === index ? "Hide API key" : "Show API key"}
              onClick={() => void reveal(index)}
            >
              {revealIndex === index ? "Hide" : "Show"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={locked || disabled}
              aria-label="Remove API key"
              onClick={() => sync(items.filter((_, i) => i !== index))}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          type="password"
          autoComplete="off"
          placeholder="Add API key"
          value={newKey}
          disabled={locked || disabled}
          onChange={(event) => setNewKey(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              addKey()
            }
          }}
          className={cn(locked && "opacity-50")}
        />
        <Button type="button" variant="secondary" disabled={locked || disabled} onClick={addKey}>
          Add
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}