import { useMemo, useState } from "react"
import {
  Brain,
  Gauge,
  Globe,
  Lightbulb,
  MessageSquare,
  Mic,
  RefreshCw,
  Server,
  type LucideIcon,
} from "lucide-react"

import { VIEW_GROUPS } from "@/App"
import type { AdminConfig, AdminSection } from "@/lib/types"
import { FieldRow } from "./FieldControl"
import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"

const SECTION_ICONS: Record<string, LucideIcon> = {
  providers: Server,
  runtime: Gauge,
  models: Brain,
  reasoning: Lightbulb,
  web_tools: Globe,
  messaging: MessageSquare,
  voice: Mic,
}

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
  const SectionIcon = SECTION_ICONS[section.id] ?? Server

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
    <Card className="gap-0 overflow-hidden">
      <CardContent className="flex flex-col gap-4 px-5 py-4 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <SectionIcon className="size-4.5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-semibold leading-tight">
                {section.label}
              </h3>
              {section.description ? (
                <p className="text-sm text-muted-foreground">{section.description}</p>
              ) : null}
            </div>
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
              <RefreshCw className={refreshing ? "animate-spin" : undefined} />
              {refreshing ? "Refreshing" : "Refresh models"}
            </Button>
          ) : null}
        </div>
        <div className="grid gap-3">{fieldRows(advancedOpen)}</div>
        {hasAdvanced ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start text-muted-foreground"
            onClick={() => setAdvancedOpen((prev) => !prev)}
          >
            {advancedOpen ? "Hide advanced" : "Show advanced"}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
