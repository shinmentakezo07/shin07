import { useMemo, useRef, useState } from "react"

import { cn } from "@/lib/utils"

interface ModelComboboxProps {
  value: string
  fieldType: "model" | "optional_model"
  models: string[]
  onChange: (value: string) => void
  onCommit?: (value: string) => void
  disabled?: boolean
  id?: string
}

const optionalModels = (fieldType: string, models: string[]) =>
  fieldType === "optional_model" ? ["None", ...models] : models

function hash(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0
  return h
}

function filterOptions(all: string[], query: string): string[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return all
  return all.filter((item) => item.toLowerCase().includes(normalized))
}

export function ModelCombobox({
  value,
  fieldType,
  models,
  onChange,
  onCommit,
  disabled = false,
  id,
}: ModelComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = `model-options-${id ?? hash(fieldType)}`

  const values = useMemo(() => optionalModels(fieldType, models), [fieldType, models])
  const visible = useMemo(() => filterOptions(values, query), [values, query])

  const close = () => {
    setOpen(false)
    setActiveIndex(-1)
    inputRef.current?.removeAttribute("aria-activedescendant")
  }

  const select = (selected: string) => {
    onChange(selected)
    onCommit?.(selected)
    setQuery("")
    close()
    inputRef.current?.focus()
  }

  const handleKeydown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      if (open) {
        const count = visible.length
        if (count === 0) return
        setActiveIndex((prev) => (prev + (event.key === "ArrowDown" ? 1 : -1) + count) % count)
      } else {
        setOpen(true)
        if (event.key === "ArrowUp") setActiveIndex(visible.length - 1)
      }
    } else if (open && event.key === "Home") {
      event.preventDefault()
      setActiveIndex(0)
    } else if (open && event.key === "End") {
      event.preventDefault()
      setActiveIndex(visible.length - 1)
    } else if (open && event.key === "Enter") {
      event.preventDefault()
      const active = visible[activeIndex]
      if (active) select(active)
    } else if (open && event.key === "Escape") {
      event.preventDefault()
      close()
    } else if (open && event.key === "Tab") {
      close()
    }
  }

  const activeId =
    open && activeIndex >= 0 && activeIndex < visible.length
      ? `${listId}-option-${activeIndex}`
      : undefined

  return (
    <div className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeId}
          className="flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-colors outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
          value={value === "None" ? "None" : value}
          disabled={disabled}
          placeholder={fieldType === "optional_model" ? "None" : ""}
          autoComplete="off"
          onClick={() => setOpen(true)}
          onInput={(event) => {
            if (!open) setOpen(true)
            setQuery((event.target as HTMLInputElement).value)
          }}
          onKeyDown={handleKeydown}
          onBlur={() => {
            if (fieldType === "optional_model" && !value.trim()) onCommit?.("None")
            close()
          }}
        />
      </div>
      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md"
          onMouseDown={(event) => event.preventDefault()}
          onMouseMove={(event) => {
            const option = (event.target as HTMLElement).closest('[role="option"]')
            if (option) setActiveIndex(visible.indexOf((option as HTMLElement).dataset.value ?? ""))
          }}
        >
          {visible.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {models.length
                ? "No matching models. You can still enter a custom slug."
                : "No discovered models. Refresh models or enter a custom slug."}
            </div>
          ) : (
            visible.map((option, index) => (
              <div
                key={option}
                id={`${listId}-option-${index}`}
                role="option"
                data-value={option}
                aria-selected={index === activeIndex}
                className={cn(
                  "px-3 py-2 text-sm",
                  index === activeIndex && "bg-accent",
                )}
                onClick={() => select(option)}
              >
                {option}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}