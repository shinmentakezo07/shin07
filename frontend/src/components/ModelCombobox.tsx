import { useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronDown, CornerDownLeft, X } from "lucide-react"

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
  const wrapperRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const listId = `model-options-${id ?? hash(fieldType)}`

  const values = useMemo(() => optionalModels(fieldType, models), [fieldType, models])
  const visible = useMemo(() => filterOptions(values, query), [values, query])

  // While the user is editing (list open or draft text present) the input
  // shows the draft; otherwise it shows the committed value. Whatever text
  // is in the box is the value once the user leaves, so model ids can be
  // typed or edited directly.
  const editing = open || query !== ""
  const displayed = editing ? query : value
  const selectedValue =
    fieldType === "optional_model" && (!value || value === "None") ? "None" : value
  const draft = query.trim()
  const draftIsOption = values.includes(draft)
  const showDraftRow = open && draft !== "" && !draftIsOption
  const canClear = !disabled && value !== "" && selectedValue !== "None"

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
    if (!draft) return
    const exact = values.find((item) => item === draft)
    commit(exact ?? draft)
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

  // Close the list when the user clicks anywhere outside the combobox.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (target && !wrapperRef.current?.contains(target)) close(true)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  // Keep the active option visible while navigating with the keyboard.
  useEffect(() => {
    if (!open || activeIndex < 0) return
    const active = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`,
    )
    active?.scrollIntoView({ block: "nearest" })
  }, [open, activeIndex])

  const activeId =
    open && activeIndex >= 0 && activeIndex < visible.length
      ? `${listId}-option-${activeIndex}`
      : undefined

  return (
    <div ref={wrapperRef} className="relative">
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
          className={cn(
            "flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            canClear ? "pr-16" : "pr-9",
          )}
          value={displayed}
          disabled={disabled}
          placeholder={fieldType === "optional_model" ? "None" : "Search or type a model id"}
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
        {canClear ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Clear model"
            title="Clear model"
            className="absolute inset-y-0 right-8 flex w-7 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              const cleared = fieldType === "optional_model" ? "None" : ""
              onChange(cleared)
              onCommit?.(cleared)
              setQuery("")
              inputRef.current?.focus()
            }}
          >
            <X className="size-4" />
          </button>
        ) : null}
        <button
          type="button"
          tabIndex={-1}
          aria-label={open ? "Close model list" : "Open model list"}
          aria-expanded={open}
          aria-controls={listId}
          className="absolute inset-y-0 right-0 flex w-8 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (open) {
              close(true)
              return
            }
            setQuery("")
            setActiveIndex(-1)
            setOpen(true)
            inputRef.current?.focus()
          }}
        >
          <ChevronDown
            className={cn(
              "size-4 transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>
      </div>
      {open ? (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Model options"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95"
          onMouseDown={(event) => event.preventDefault()}
          onMouseMove={(event) => {
            const option = (event.target as HTMLElement).closest('[role="option"]')
            if (option) {
              setActiveIndex(
                visible.indexOf((option as HTMLElement).dataset.value ?? ""),
              )
            }
          }}
        >
          {showDraftRow ? (
            <div
              role="option"
              aria-selected="false"
              className="mb-1 flex cursor-pointer items-center gap-2 rounded-sm border-b px-2 py-1.5 text-sm text-primary"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => commitDraft()}
            >
              <CornerDownLeft className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                Use &quot;{draft}&quot;
              </span>
            </div>
          ) : null}
          {visible.length === 0 ? (
            <div className="px-2 py-2 text-sm text-muted-foreground">
              {showDraftRow
                ? "Press Enter to use this model id."
                : models.length
                  ? "No matching models. Type a model id and press Enter."
                  : "No discovered models. Type a model id and press Enter, or refresh models."}
            </div>
          ) : (
            visible.map((option, index) => {
              const isSelected = option === selectedValue
              return (
                <div
                  key={option}
                  id={`${listId}-option-${index}`}
                  role="option"
                  data-value={option}
                  data-index={index}
                  aria-selected={isSelected || index === activeIndex}
                  className={cn(
                    "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors",
                    index === activeIndex && "bg-accent text-accent-foreground",
                    isSelected && "font-medium text-foreground",
                  )}
                  onClick={() => commit(option)}
                >
                  <Check
                    className={cn(
                      "size-4 shrink-0",
                      isSelected ? "text-primary opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{option}</span>
                </div>
              )
            })
          )}
        </div>
      ) : null}
    </div>
  )
}
