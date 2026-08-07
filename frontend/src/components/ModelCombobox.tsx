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

  // While the user is editing (list open or draft text present) the input
  // shows the draft; otherwise it shows the committed value. Whatever text
  // is in the box is the value once the user leaves, so model ids can be
  // typed or edited directly.
  const editing = open || query !== ""
  const displayed = editing ? query : value

  const close = (discardQuery: boolean) => {
    setOpen(false)
    setActiveIndex(-1)
    if (discardQuery) setQuery("")
    inputRef.current?.removeAttribute("aria-activedescendant")
  }

  const commit = (next: string) => {
    onChange(next)
    onCommit?.(next)
    setQuery("")
    close(false)
    inputRef.current?.focus()
  }

  // Commit the draft text: an exact option wins, otherwise the typed text
  // is used as a custom model id.
  const commitDraft = () => {
    const text = query.trim()
    if (!text) return
    const exact = values.find((item) => item === text)
    commit(exact ?? text)
  }

  const handleKeydown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      if (open) {
        const count = visible.length
        if (count === 0) return
        setActiveIndex(
          (prev) => (prev + (event.key === "ArrowDown" ? 1 : -1) + count) % count,
        )
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
    } else if (event.key === "Enter") {
      event.preventDefault()
      const active =
        open && activeIndex >= 0 && activeIndex < visible.length
          ? visible[activeIndex]
          : undefined
      if (active) commit(active)
      else commitDraft()
    } else if (open && event.key === "Escape") {
      event.preventDefault()
      close(true)
    } else if (open && event.key === "Tab") {
      close(false)
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
          value={displayed}
          disabled={disabled}
          placeholder={fieldType === "optional_model" ? "None" : ""}
          autoComplete="off"
          onClick={() => {
            if (!open) {
              setQuery("")
              setActiveIndex(-1)
            }
            setOpen(true)
          }}
          onInput={(event) => {
            const text = (event.target as HTMLInputElement).value
            if (!open) setOpen(true)
            setQuery(text)
            setActiveIndex(-1)
          }}
          onKeyDown={handleKeydown}
          onBlur={() => {
            // WYSIWYG: whatever is in the box becomes the value. An exact
            // option match selects the canonical option; any other non-empty
            // draft is committed as a custom model id.
            if (query.trim() && query !== value) {
              const exact = values.find((item) => item === query)
              const next = exact ?? query
              onChange(next)
              onCommit?.(next)
            } else if (fieldType === "optional_model" && !value.trim()) {
              onChange("None")
              onCommit?.("None")
            }
            setQuery("")
            close(false)
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
                ? "No matching models. Press Enter to use your typed model id."
                : "No discovered models. Type a model id and press Enter, or refresh models."}
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
                onClick={() => commit(option)}
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
