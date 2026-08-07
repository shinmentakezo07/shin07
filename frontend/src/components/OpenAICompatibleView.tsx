import { useEffect, useState } from "react"

import type {
  AdminConfig,
  LocalProviderStatus,
  OpenAICompatibleInstance,
} from "@/lib/types"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"
import { Input } from "./ui/input"
import { Label } from "./ui/label"

const INSTANCES_FIELD_KEY = "OPENAI_COMPATIBLE_INSTANCES"

interface OpenAICompatibleViewProps {
  config: AdminConfig
  values: Record<string, string>
  onValuesChange: (values: Record<string, string>) => void
  localStatus: Record<string, LocalProviderStatus>
  onTestProvider: (providerId: string, done?: () => void) => void
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

function badgeVariant(status: string): "ok" | "warn" | "error" | "neutral" {
  if (["configured", "reachable"].includes(status)) return "ok"
  if (["missing_key", "missing_config", "missing_url", "unknown"].includes(status))
    return "warn"
  if (["offline", "error"].includes(status)) return "error"
  return "neutral"
}

interface InstanceCardProps {
  index: number
  instance: OpenAICompatibleInstance
  status: InstanceStatus
  locked: boolean
  testing: boolean
  onPatch: (patch: Partial<OpenAICompatibleInstance>) => void
  onRemove: () => void
  onTest: () => void
}

function InstanceCard({
  index,
  instance,
  status,
  locked,
  testing,
  onPatch,
  onRemove,
  onTest,
}: InstanceCardProps) {
  const providerId = providerIdFor(index)
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h4 className="text-base font-semibold">Endpoint {index + 1}</h4>
            <Badge variant="outline" className="font-mono">
              {providerId}/&lt;model&gt;
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={badgeVariant(status.status)}>{status.label}</Badge>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={locked}
              onClick={onRemove}
            >
              Remove
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
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {status.baseUrl ? `Resolves to ${status.baseUrl}` : "Not checked yet"}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={locked || !instance.base_url.trim() || testing}
            onClick={onTest}
          >
            {testing ? "Testing…" : "Test connection"}
          </Button>
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
}: OpenAICompatibleViewProps) {
  const field = config.fields.find(
    (candidate) => candidate.key === INSTANCES_FIELD_KEY,
  )
  const raw = values[INSTANCES_FIELD_KEY] ?? field?.value ?? "[]"
  const [instances, setInstances] = useState<OpenAICompatibleInstance[]>(() =>
    parseInstances(raw),
  )
  const [testingId, setTestingId] = useState<string | null>(null)

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

  if (!field) {
    return (
      <p className="text-sm text-muted-foreground">
        OpenAI-Compatible endpoint management is unavailable in this config.
      </p>
    )
  }

  const legacyBaseUrl = values["OPENAI_COMPATIBLE_BASE_URL"] ?? ""
  const legacyKey = values["OPENAI_COMPATIBLE_API_KEY"] ?? ""

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Endpoints</h3>
        <p className="text-sm text-muted-foreground">
          Add any OpenAI-compatible server (vLLM, LM Studio, Ollama, Together, or
          your own gateway). Each endpoint becomes a numbered provider:{" "}
          <code>openai_compatible_1/&lt;model&gt;</code>,{" "}
          <code>openai_compatible_2/&lt;model&gt;</code>, … Use the number in
          model routes to tell endpoints apart, then Apply to save.
        </p>
      </div>

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
            Import as endpoint 1
          </Button>
        </div>
      ) : null}

      {instances.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              No endpoints yet. Add your first OpenAI-compatible endpoint.
            </p>
            <Button type="button" onClick={addInstance}>
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
                onPatch={(patch) => updateInstance(index, patch)}
                onRemove={() => removeInstance(index)}
                onTest={() => {
                  setTestingId(providerId)
                  onTestProvider(providerId, () => setTestingId(null))
                }}
              />
            )
          })}
          <div>
            <Button type="button" variant="secondary" onClick={addInstance}>
              Add endpoint
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
