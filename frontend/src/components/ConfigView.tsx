import { useMemo, useState } from "react"

import { VIEW_GROUPS } from "@/App"
import type { AdminConfig, AdminSection } from "@/lib/types"
import { FieldRow } from "./FieldControl"
import { Button } from "./ui/button"

interface ConfigViewProps {
  config: AdminConfig
  values: Record<string, string>
  onValuesChange: (values: Record<string, string>) => void
  modelOptions: string[]
  onRefreshModels: (providerId: string, done: () => void) => void
  focusedView: string
}

export function ConfigView({
  config,
  values,
  onValuesChange,
  modelOptions,
  onRefreshModels,
  focusedView,
}: ConfigViewProps) {
  const group = VIEW_GROUPS.find((view) => view.id === focusedView) ?? VIEW_GROUPS[0]
  const sectionIds = new Set(group.sections)

  const sections = useMemo(
    () =>
      config.sections
        .filter((section) => sectionIds.has(section.id))
        .map((section) => ({
          section,
          fields: config.fields.filter((field) => field.section === section.id),
        }))
        .filter((entry) => entry.fields.length > 0),
    [config, sectionIds],
  )

  return (
    <>
      {sections.map(({ section, fields }) => (
        <SettingsSection
          key={section.id}
          section={section}
          fields={fields}
          values={values}
          onValuesChange={onValuesChange}
          modelOptions={modelOptions}
          onRefreshModels={onRefreshModels}
        />
      ))}
    </>
  )
}

interface SettingsSectionProps {
  section: AdminSection
  fields: AdminConfig["fields"]
  values: Record<string, string>
  onValuesChange: (values: Record<string, string>) => void
  modelOptions: string[]
  onRefreshModels: (providerId: string, done: () => void) => void
}

function SettingsSection({
  section,
  fields,
  values,
  onValuesChange,
  modelOptions,
  onRefreshModels,
}: SettingsSectionProps) {
  const hasAdvanced = fields.some((field) => field.advanced)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const isModelSection = section.id === "models"

  const fieldRows = (showAdvanced: boolean) =>
    fields
      .filter((field) => !field.advanced || showAdvanced)
      .map((field) => (
        <FieldRow
          key={field.key}
          field={field}
          value={values[field.key] ?? ""}
          modelOptions={modelOptions}
          onValueChange={(key, value) => onValuesChange({ ...values, [key]: value })}
          onMessage={() => undefined}
        />
      ))

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{section.label}</h3>
          {section.description ? (
            <p className="text-sm text-muted-foreground">{section.description}</p>
          ) : null}
        </div>
        {isModelSection ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={refreshing}
            onClick={() => {
              setRefreshing(true)
              onRefreshModels("__refresh_models__", () => setRefreshing(false))
            }}
          >
            {refreshing ? "Refreshing" : "Refresh models"}
          </Button>
        ) : null}
      </div>
      <div className="grid gap-4">
        {fieldRows(advancedOpen)}
      </div>
      {hasAdvanced ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setAdvancedOpen((prev) => !prev)}
        >
          {advancedOpen ? "Hide advanced" : "Show advanced"}
        </Button>
      ) : null}
    </section>
  )
}