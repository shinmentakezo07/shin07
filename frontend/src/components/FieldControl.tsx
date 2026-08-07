import { useState } from "react"
import { Info } from "lucide-react"

import type { AdminField } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Badge } from "./ui/badge"
import { Checkbox } from "./ui/checkbox"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Select } from "./ui/select"
import { Textarea } from "./ui/textarea"
import { ModelCombobox } from "./ModelCombobox"
import { PoolEditor } from "./PoolEditor"

interface FieldControlProps {
  field: AdminField
  value: string
  modelOptions: string[]
  onValueChange: (key: string, value: string) => void
  onMessage: (text: string, kind?: string) => void
}

export function FieldControl({
  field,
  value,
  modelOptions,
  onValueChange,
  onMessage,
}: FieldControlProps) {
  if (field.pool_supported) {
    return (
      <PoolEditor
        value={value}
        locked={field.locked}
        keyCount={field.key_count ?? 0}
        fieldKey={field.key}
        onChange={(next) => onValueChange(field.key, next)}
        onMessage={onMessage}
      />
    )
  }

  switch (field.type) {
    case "boolean":
      return (
        <Checkbox
          id={`field-${field.key}`}
          checked={value === "true"}
          disabled={field.locked}
          onCheckedChange={(checked) =>
            onValueChange(field.key, checked === true ? "true" : "false")
          }
        />
      )
    case "select":
      return (
        <Select
          id={`field-${field.key}`}
          value={value}
          disabled={field.locked}
          onChange={(event) => onValueChange(field.key, event.target.value)}
        >
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      )
    case "textarea":
      return (
        <Textarea
          id={`field-${field.key}`}
          value={value}
          disabled={field.locked}
          onChange={(event) => onValueChange(field.key, event.target.value)}
        />
      )
    case "model":
    case "optional_model":
      return (
        <ModelCombobox
          id={`field-${field.key}`}
          value={value}
          fieldType={field.type}
          models={modelOptions}
          disabled={field.locked}
          onChange={(next) => onValueChange(field.key, next)}
        />
      )
    case "secret":
      return (
        <SecretInput
          field={field}
          value={value}
          onValueChange={onValueChange}
        />
      )
    default:
      return (
        <Input
          id={`field-${field.key}`}
          type={field.type === "number" ? "number" : "text"}
          value={value}
          disabled={field.locked}
          onChange={(event) => onValueChange(field.key, event.target.value)}
        />
      )
  }
}

function SecretInput({
  field,
  value,
  onValueChange,
}: {
  field: AdminField
  value: string
  onValueChange: (key: string, value: string) => void
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input
        id={`field-${field.key}`}
        type={visible ? "text" : "password"}
        value={value}
        disabled={field.locked}
        placeholder={
          field.configured
            ? "Configured - enter a new value to replace"
            : "Not configured"
        }
        autoComplete="off"
        onChange={(event) => onValueChange(field.key, event.target.value)}
      />
      <button
        type="button"
        className="absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground"
        aria-label={visible ? "Hide API key" : "Show API key"}
        onMouseDown={(event) => {
          event.preventDefault()
          setVisible((prev) => !prev)
        }}
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  )
}

interface FieldRowProps {
  field: AdminField
  value: string
  modelOptions: string[]
  onValueChange: (key: string, value: string) => void
  onMessage: (text: string, kind?: string) => void
  className?: string
}

export function FieldRow({
  field,
  value,
  modelOptions,
  onValueChange,
  onMessage,
  className,
}: FieldRowProps) {
  const source = sourceText(field)
  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-lg border bg-card/40 p-4 transition-colors hover:border-border/80",
        className,
      )}
      data-key={field.key}
    >
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={field.type === "boolean" ? undefined : `field-${field.key}`}>
          <span className="text-sm font-medium">{field.label}</span>
        </Label>
        {source ? (
          <Badge
            variant="outline"
            className="gap-1 px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
          >
            {source}
          </Badge>
        ) : null}
      </div>
      <FieldControl
        field={field}
        value={value}
        modelOptions={modelOptions}
        onValueChange={onValueChange}
        onMessage={onMessage}
      />
      {field.description ? (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0 opacity-70" />
          <span>{field.description}</span>
        </p>
      ) : null}
    </div>
  )
}

function sourceText(field: AdminField): string {
  const labels: Record<string, string> = {
    default: "default",
    template: "template",
    repo_env: "repo .env",
    explicit_env_file: "FCC_ENV_FILE",
    process: "process env",
  }
  const parts: string[] = []
  const label = Object.prototype.hasOwnProperty.call(labels, field.source)
    ? labels[field.source]
    : field.source
  if (label) parts.push(label)
  if (field.locked) parts.push("locked")
  return parts.join(" ")
}