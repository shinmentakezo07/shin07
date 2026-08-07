import { useEffect, useState } from "react"
import {
  Cable,
  Check,
  ListChecks,
  ListPlus,
  Loader2,
  Plus,
  RefreshCw,
  Repeat,
  Server,
  Star,
  Trash2,
} from "lucide-react"

import { statusClass } from "@/App"
import type {
  AdminConfig,
  LocalProviderStatus,
  OpenAICompatibleInstance,
} from "@/lib/types"
import { statusDotClass } from "@/lib/status"
import { cn } from "@/lib/utils"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"
import { Checkbox } from "./ui/checkbox"
import { Input } from "./ui/input"
import { Label } from "./ui/label"

const INSTANCES_FIELD_KEY = "OPENAI_COMPATIBLE_INSTANCES"

interface OpenAICompatibleViewProps {
  config: AdminConfig
  values: Record<string, string>
  onValuesChange: (values: Record<string, string>) => void
  localStatus: Record<string, LocalProviderStatus>
  onTestProvider: (providerId: string, done?: () => void) => void
  onFetchModels: (providerId: string) => Promise<string[]>
  onAddModels: (providerId: string, models: string[]) => void
  onMessage: (text: string, kind?: string) => void
}

interface InstanceStatus {
  status: string
  label: string
  baseUrl: string
}

function parseInstances(raw: string | undefined): OpenAICompatibleInstance[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is OpenAICompatibleInstance =>
        entry !== null && typeof entry === "object",
    )
  } catch {
    return []
  }
}

function providerIdFor(index: number): string {
  return `openai_compatible_${index + 1}`
}

function statusFor(
  providerId: string,
  config: AdminConfig,
  localStatus: Record<string, LocalProviderStatus>,
): InstanceStatus {
  const tested = localStatus[providerId]
  if (tested) {
    return {
      status: tested.status,
      label: tested.label,
      baseUrl: tested.base_url ?? "",
    }
  }
  const descriptor = config.provider_status.find(
    (candidate) => candidate.provider_id === providerId,
  )
  return {
    status: descriptor?.status ?? "unknown",
    label: descriptor?.label ?? "Not configured",
    baseUrl: descriptor?.base_url ?? "",
  }
}

interface InstanceCardProps {
  index: number
  instance: OpenAICompatibleInstance
  status: InstanceStatus
  locked: boolean
  testing: boolean
  fetching: boolean
  models: string[]
  selected: string[]
  currentDefault: string
  onPatch: (patch: Partial<OpenAICompatibleInstance>) => void
  onRemove: () => void
  onTest: () => void
  onFetch: () => void
  onClearModels: () => void
  onAddModels: (models: string[]) => void
  onToggleModel: (model: string) => void
  onUseModel: (model: string) => void
}

function InstanceCard({
  index,
  instance,
  status,
  locked,
  testing,
  fetching,
  models,
  selected,
  currentDefault,
  onPatch,
  onRemove,
  onTest,
  onFetch,
  onClearModels,
  onAddModels,
  onToggleModel,
  onUseModel,
}: InstanceCardProps) {
  const providerId = providerIdFor(index)
  const canProbe = !locked && Boolean(instance.base_url.trim())
  const [modelDraft, setModelDraft] = useState("")

  const addFromDraft = () => {
    const ids = modelDraft
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
    if (ids.length === 0) return
    onAddModels(ids)
    setModelDraft("")
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary ring-1 ring-primary/20">
              {index + 1}
            </span>
            <div className="min-w-0">
              <h4 className="text-base font-semibold leading-tight">
                Endpoint {index + 1}
              </h4>
              <p className="font-mono text-xs text-muted-foreground">
                {providerId}/&lt;model&gt;
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant={statusClass(status.status)} className="gap-1.5">
              <span className={cn("size-1.5 rounded-full", statusDotClass(status.status))} />
              {status.label}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={locked}
              aria-label={`Remove endpoint ${index + 1}`}
              title="Remove endpoint"
              onClick={onRemove}
            >
              <Trash2 />
            </Button>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${providerId}-base-url`}>Base URL</Label>
            <Input
              id={`${providerId}-base-url`}
              type="text"
              placeholder="https://your-gateway.example/v1"
              value={instance.base_url}
              disabled={locked}
              onChange={(event) => onPatch({ base_url: event.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${providerId}-api-keys`}>API keys</Label>
            <Input
              id={`${providerId}-api-keys`}
              type="text"
              autoComplete="off"
              placeholder="key1, key2"
              value={instance.api_keys}
              disabled={locked}
              onChange={(event) => onPatch({ api_keys: event.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated keys rotate round-robin with failover. Leave empty
              for keyless local servers.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${providerId}-proxy`}>Proxy (optional)</Label>
          <Input
            id={`${providerId}-proxy`}
            type="text"
            placeholder="http://proxy:8080"
            value={instance.proxy}
            disabled={locked}
            onChange={(event) => onPatch({ proxy: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <ListChecks className="size-4 text-muted-foreground" />
                {models.length === 0
                  ? "No model ids yet"
                  : `${models.length} model id${models.length === 1 ? "" : "s"}`}
              </p>
              {selected.length > 0 ? (
                <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[10px]">
                  <Check className="size-3" />
                  {selected.length} selected
                </Badge>
              ) : null}
            </div>
            {models.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={locked}
                onClick={onClearModels}
              >
                <Trash2 />
                Clear
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Input
              id={`${providerId}-model-id`}
              type="text"
              autoComplete="off"
              placeholder="Add model id, comma-separated (gpt-4o, deepseek-v3, …)"
              value={modelDraft}
              disabled={locked}
              onChange={(event) => setModelDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  addFromDraft()
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={locked || !modelDraft.trim()}
              onClick={addFromDraft}
            >
              <ListPlus />
              Add
            </Button>
          </div>
          {models.length > 0 ? (
            <div className="grid max-h-56 gap-1 overflow-auto">
              {models.map((model) => {
                // The prefix is optional: a bare id also matches the default.
                const isDefault =
                  model === currentDefault ||
                  `${providerId}/${model}` === currentDefault
                return (
                  <div
                    key={model}
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors hover:border-border",
                      isDefault
                        ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                        : "border-transparent bg-card",
                    )}
                  >
                    <Checkbox
                      id={`${providerId}-model-${model}`}
                      checked={selected.includes(model)}
                      disabled={locked}
                      aria-label={`Apply model ${model}`}
                      title={
                        selected.includes(model)
                          ? "Applied to this endpoint"
                          : "Select to apply this model"
                      }
                      onCheckedChange={() => onToggleModel(model)}
                    />
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      {isDefault ? (
                        <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-500" />
                      ) : null}
                      <span className="truncate font-mono text-xs">{model}</span>
                      {isDefault ? (
                        <Badge variant="ok" className="px-1.5 py-0 text-[10px]">
                          default
                        </Badge>
                      ) : null}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={locked}
                      onClick={() => onUseModel(model)}
                    >
                      <Star className="size-3.5" />
                      Use as default
                    </Button>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Add model ids manually, or use <strong>Fetch models</strong> below
              to pull them from GET {`{base}`}/models.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Cable className="size-3.5" />
            {status.baseUrl ? `Resolves to ${status.baseUrl}` : "Not checked yet"}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!canProbe || fetching}
              onClick={onFetch}
              title="Fetch model ids from GET {base}/models (uses the saved config, Apply first)"
            >
              {fetching ? (
                <Loader2 className="animate-spin" />
              ) : (
                <RefreshCw />
              )}
              {fetching ? "Fetching…" : "Fetch models"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!canProbe || testing}
              onClick={onTest}
            >
              {testing ? <Loader2 className="animate-spin" /> : <Cable />}
              {testing ? "Testing…" : "Test connection"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function OpenAICompatibleView({
  config,
  values,
  onValuesChange,
  localStatus,
  onTestProvider,
  onFetchModels,
  onAddModels,
  onMessage,
}: OpenAICompatibleViewProps) {
  const field = config.fields.find(
    (candidate) => candidate.key === INSTANCES_FIELD_KEY,
  )
  const raw = values[INSTANCES_FIELD_KEY] ?? field?.value ?? "[]"
  const [instances, setInstances] = useState<OpenAICompatibleInstance[]>(() =>
    parseInstances(raw),
  )
  const [testingId, setTestingId] = useState<string | null>(null)
  const [fetchingId, setFetchingId] = useState<string | null>(null)
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, string[]>>(
    {},
  )

  useEffect(() => {
    setInstances(parseInstances(raw))
  }, [raw])

  const commit = (next: OpenAICompatibleInstance[]) => {
    setInstances(next)
    onValuesChange({ ...values, [INSTANCES_FIELD_KEY]: JSON.stringify(next) })
  }

  const updateInstance = (index: number, patch: Partial<OpenAICompatibleInstance>) => {
    commit(
      instances.map((instance, i) =>
        i === index ? { ...instance, ...patch } : instance,
      ),
    )
  }

  const addInstance = () => {
    commit([...instances, { base_url: "", api_keys: "", proxy: "" }])
  }

  const removeInstance = (index: number) => {
    commit(instances.filter((_, i) => i !== index))
  }

  const fetchModels = async (index: number) => {
    const providerId = providerIdFor(index)
    setFetchingId(providerId)
    try {
      const models = await onFetchModels(providerId)
      if (models.length === 0) {
        onMessage(`No models found at ${providerId}.`, "warn")
        return
      }
      setModelsByProvider((prev) => ({
        ...prev,
        [providerId]: [...new Set([...(prev[providerId] ?? []), ...models])],
      }))
      onMessage(`Fetched ${models.length} models from ${providerId}.`, "ok")
    } finally {
      setFetchingId(null)
    }
  }

  const addModels = (index: number, models: string[]) => {
    const providerId = providerIdFor(index)
    setModelsByProvider((prev) => ({
      ...prev,
      [providerId]: [...new Set([...(prev[providerId] ?? []), ...models])],
    }))
    // Manually added ids are deliberately typed, so apply them immediately.
    const current = instances[index]?.models ?? []
    updateInstance(index, { models: [...new Set([...current, ...models])] })
    onAddModels(providerId, models)
    onMessage(
      `Added ${models.length} model id${models.length === 1 ? "" : "s"} to ${providerId}. Apply to save.`,
      "ok",
    )
  }

  const toggleModel = (index: number, model: string) => {
    const current = instances[index]?.models ?? []
    updateInstance(
      index,
      current.includes(model)
        ? { models: current.filter((candidate) => candidate !== model) }
        : { models: [...current, model] },
    )
  }

  const useModelAsDefault = (index: number, model: string) => {
    // Set the bare id: the prefix is optional, so MODEL=deepseek routes to
    // whatever endpoint advertises it (round-robin across duplicates).
    onValuesChange({ ...values, MODEL: model })
    const current = instances[index]?.models ?? []
    if (!current.includes(model)) {
      updateInstance(index, { models: [...current, model] })
    }
    onMessage(`Default model set to ${model}. Apply to save.`, "ok")
  }

  if (!field) {
    return (
      <p className="text-sm text-muted-foreground">
        OpenAI-Compatible endpoint management is unavailable in this config.
      </p>
    )
  }

  const legacyBaseUrl = values["OPENAI_COMPATIBLE_BASE_URL"] ?? ""
  const legacyKey = values["OPENAI_COMPATIBLE_API_KEY"] ?? ""
  const cardModels = (index: number): string[] => {
    const providerId = providerIdFor(index)
    return [
      ...new Set([
        ...(instances[index]?.models ?? []),
        ...(modelsByProvider[providerId] ?? []),
      ]),
    ]
  }
  const keyCountFor = (index: number): number =>
    (instances[index]?.api_keys ?? "")
      .split(",")
      .filter((key) => key.trim()).length
  const totalModels = instances.reduce(
    (sum, _instance, index) => sum + cardModels(index).length,
    0,
  )
  // Model ids served by more than one endpoint rotate provider + key pool
  // round-robin at runtime; surface that so it is never a surprise.
  const duplicateModelIds = (() => {
    const byModel = new Map<string, number[]>()
    instances.forEach((_instance, index) => {
      cardModels(index).forEach((model) => {
        byModel.set(model, [...(byModel.get(model) ?? []), index])
      })
    })
    return [...byModel.entries()]
      .filter(([, indexes]) => indexes.length > 1)
      .sort(([a], [b]) => a.localeCompare(b))
  })()

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Endpoints</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Add any OpenAI-compatible server (vLLM, LM Studio, Ollama, Together, or
          your own gateway). Each endpoint becomes a numbered provider:{" "}
          <code>openai_compatible_1/&lt;model&gt;</code>,{" "}
          <code>openai_compatible_2/&lt;model&gt;</code>, … The prefix is
          optional — a model id also works bare (<code>MODEL=deepseek</code>) and
          resolves to whichever endpoint advertises it; when the same id exists
          on several endpoints, requests rotate round-robin across providers and
          key pools. Add as many model ids as you want per endpoint,
          comma-separated, or use <strong>Fetch models</strong> to pull them from
          the endpoint's <code>/models</code> route. Tick the models you want
          applied — selected ids are saved with the endpoint on{" "}
          <strong>Apply</strong> and appear in the Model Config dropdowns after a
          reload.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-1.5">
            <Server className="size-3.5 text-muted-foreground" />
            {instances.length} endpoint{instances.length === 1 ? "" : "s"}
          </Badge>
          <Badge variant="outline" className="gap-1.5">
            <ListChecks className="size-3.5 text-muted-foreground" />
            {totalModels} model id{totalModels === 1 ? "" : "s"}
          </Badge>
        </div>
      </div>

      {duplicateModelIds.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
            <Repeat className="size-4 shrink-0" />
            Model ids shared across endpoints rotate round-robin
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-amber-800/90 dark:text-amber-200/90">
            {duplicateModelIds.map(([model, indexes]) => (
              <li key={model}>
                <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs dark:bg-amber-500/15">
                  {model}
                </code>{" "}
                is served by{" "}
                {indexes
                  .map(
                    (index) =>
                      `Endpoint ${index + 1} (${keyCountFor(index)} key${
                        keyCountFor(index) === 1 ? "" : "s"
                      })`,
                  )
                  .join(", ")}{" "}
                — requests cycle across providers and key pools.
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {instances.length === 0 && legacyBaseUrl.trim() ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            You already have the legacy <code>OPENAI_COMPATIBLE_BASE_URL</code>{" "}
            endpoint configured. Import it as endpoint 1, or keep it and add more
            endpoints below.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              commit([{ base_url: legacyBaseUrl, api_keys: legacyKey, proxy: "" }])
            }
          >
            <ListPlus />
            Import as endpoint 1
          </Button>
        </div>
      ) : null}

      {instances.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10">
              <Server className="size-6 text-primary" />
            </span>
            <p className="text-sm text-muted-foreground">
              No endpoints yet. Add your first OpenAI-compatible endpoint.
            </p>
            <Button type="button" onClick={addInstance}>
              <Plus />
              Add endpoint
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {instances.map((instance, index) => {
            const providerId = providerIdFor(index)
            return (
              <InstanceCard
                key={providerId}
                index={index}
                instance={instance}
                status={statusFor(providerId, config, localStatus)}
                locked={field.locked}
                testing={testingId === providerId}
                fetching={fetchingId === providerId}
                models={cardModels(index)}
                selected={instance.models ?? []}
                currentDefault={values["MODEL"] ?? ""}
                onPatch={(patch) => updateInstance(index, patch)}
                onRemove={() => removeInstance(index)}
                onTest={() => {
                  setTestingId(providerId)
                  onTestProvider(providerId, () => setTestingId(null))
                }}
                onFetch={() => void fetchModels(index)}
                onClearModels={() => {
                  setModelsByProvider((prev) => ({ ...prev, [providerId]: [] }))
                  updateInstance(index, { models: [] })
                }}
                onAddModels={(models) => addModels(index, models)}
                onToggleModel={(model) => toggleModel(index, model)}
                onUseModel={(model) => useModelAsDefault(index, model)}
              />
            )
          })}
          <Button
            type="button"
            variant="outline"
            className="w-full border-dashed"
            onClick={addInstance}
          >
            <Plus />
            Add endpoint
          </Button>
        </div>
      )}
    </section>
  )
}
