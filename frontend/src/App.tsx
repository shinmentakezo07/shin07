import { useCallback, useEffect, useRef, useState } from "react"
import {
  type LucideIcon,
  Gauge,
  Menu,
  MessageSquare,
  Plug,
  Server,
  SlidersHorizontal,
  X,
} from "lucide-react"

import {
  applyConfig,
  cancelConnectedAccountLogin,
  disconnectConnectedAccount,
  fetchAdminConfig,
  fetchConnectedAccount,
  fetchLocalStatus,
  fetchModelOptions,
  startConnectedAccountLogin,
  testProvider,
  validateConfig,
} from "@/lib/api"
import type {
  AdminConfig,
  AdminField,
  ConnectedAccountStatus,
  LocalProviderStatus,
} from "@/lib/types"

import { ActionBar } from "./components/ActionBar"
import { ConfigView } from "./components/ConfigView"
import { OpenAICompatibleView } from "./components/OpenAICompatibleView"
import { ProvidersView } from "./components/ProvidersView"
import { Sidebar } from "./components/Sidebar"
import { UsageView } from "./components/UsageView"
import { ThemeToggle } from "./components/ThemeToggle"
import { Badge } from "./components/ui/badge"
import { Button } from "./components/ui/button"
import { Skeleton } from "./components/ui/skeleton"

export const MASKED_SECRET = "********"

interface ViewGroup {
  id: string
  label: string
  title: string
  description: string
  path: string
  sections: string[]
  icon: LucideIcon
}

export const VIEW_GROUPS: ViewGroup[] = [
  {
    id: "providers",
    label: "Providers",
    title: "Providers",
    description: "Check connectivity and manage provider credentials",
    path: "providers",
    sections: ["providers", "runtime"],
    icon: Server,
  },
  {
    id: "model_config",
    label: "Model Config",
    title: "Model Config",
    description: "Choose models, reasoning behavior, and web tooling",
    path: "model-config",
    sections: ["models", "reasoning", "web_tools"],
    icon: SlidersHorizontal,
  },
  {
    id: "openai_compatible",
    label: "OpenAI-Compatible",
    title: "OpenAI-Compatible Endpoints",
    description: "Add any OpenAI-compatible server as a numbered provider",
    path: "openai-compatible",
    sections: [],
    icon: Plug,
  },
  {
    id: "messaging",
    label: "Messaging",
    title: "Messaging",
    description: "Chat platforms and voice integration",
    path: "messaging",
    sections: ["messaging", "voice"],
    icon: MessageSquare,
  },
  {
    id: "usage",
    label: "Usage",
    title: "Usage",
    description: "Token throughput and recent request logs",
    path: "usage",
    sections: [],
    icon: Gauge,
  },
]

function viewFromPath(path: string): string {
  return VIEW_GROUPS.find((view) => view.path === path)?.id ?? "providers"
}
// Numbered OpenAI-compatible endpoints ("openai_compatible_1", ...) are
// routable by bare model id; the provider prefix is optional for them.
function isNumberedInstance(providerId: string): boolean {
  return /^openai_compatible_\d+$/.test(providerId)
}
function endpointModelOption(providerId: string, model: string): string {
  return isNumberedInstance(providerId) ? model : `${providerId}/${model}`
}

function pathFromHash(): string {
  const hash = window.location.hash.replace(/^#\/?/, "")
  const [first] = hash.split("?")
  return first || ""
}

function syncActiveView(): string {
  const view = viewFromPath(pathFromHash())
  window.location.hash = `/${VIEW_GROUPS.find((candidate) => candidate.id === view)?.path ?? view}`
  return view
}

export type StatusClass = "ok" | "warn" | "error" | "neutral"

const statusKind = (status: string | undefined): StatusClass => {
  if (["configured", "reachable", "running", "connected"].includes(status ?? "")) return "ok"
  if (["missing_key", "missing_config", "missing_url", "unknown", "connecting"].includes(status ?? ""))
    return "warn"
  if (["offline", "error"].includes(status ?? "")) return "error"
  return "neutral"
}

export function originalFieldValue(field: AdminField): string {
  if (field.type === "boolean") {
    return String(field.value).toLowerCase() === "true" ? "true" : "false"
  }
  if (field.type === "optional_model" && field.value === "None") return ""
  if (field.pool_supported) return (field.keys || []).join(",")
  return field.value || ""
}

export function initialFieldValue(field: AdminField): string {
  if (field.pool_supported) return (field.keys || []).join(",")
  if (field.type === "secret") return ""
  if (field.type === "boolean") {
    return String(field.value).toLowerCase() === "true" ? "true" : "false"
  }
  if (field.type === "optional_model" && field.value === "None") return ""
  if (field.pool_supported) return (field.keys || []).join(",")
  return field.value || ""
}

export function readFieldValue(field: AdminField, current: string): string {
  if (field.type === "boolean") return current === "true" ? "true" : "false"
  if (field.type === "optional_model" && current.trim().toLowerCase() === "none") return ""
  if (field.pool_supported) return current
  if (field.secret && field.configured) {
    return current ? current : MASKED_SECRET
  }
  return current
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export default function App() {
  const [config, setConfig] = useState<AdminConfig | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [localStatus, setLocalStatus] = useState<Record<string, LocalProviderStatus>>({})
  const [connectedStatus, setConnectedStatus] = useState<
    Record<string, ConnectedAccountStatus>
  >({})
  const [connectedLoading, setConnectedLoading] = useState<Record<string, boolean>>({})
  const [message, setMessage] = useState<{ text: string; kind?: string } | null>(null)
  const [activeView, setActiveView] = useState<string>(() => syncActiveView())
  const [applying, setApplying] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const authTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const setMessageOk = useCallback((text: string) => setMessage({ text }), [])
  const setMessageError = useCallback(
    (text: string) => setMessage({ text, kind: "error" }),
    [],
  )
  const setMessageWarn = useCallback(
    (text: string) => setMessage({ text, kind: "warn" }),
    [],
  )
  const showMessage = useCallback(
    (text: string, kind?: string) => setMessage({ text, kind }),
    [],
  )

  const changedValues = useCallback((): Record<string, string> => {
    if (!config) return {}
    const changed: Record<string, string> = {}
    for (const field of config.fields) {
      if (field.locked) continue
      const current = readFieldValue(field, values[field.key] ?? "")
      if (current !== originalFieldValue(field)) {
        changed[field.key] = current
      }
    }
    return changed
  }, [config, values])

  const dirtyCount = Object.keys(changedValues()).length

  const clearAuthPoll = useCallback((providerId: string) => {
    const timer = authTimers.current[providerId]
    if (timer) {
      clearTimeout(timer)
      delete authTimers.current[providerId]
    }
  }, [])

  const pollConnectedAccount = useCallback(
    (providerId: string) => {
      clearAuthPoll(providerId)
      const timer = setTimeout(async () => {
        try {
          const status = await fetchConnectedAccount(providerId)
          setConnectedStatus((prev) => ({ ...prev, [providerId]: status }))
          if (status.state === "connecting") {
            pollConnectedAccount(providerId)
          } else {
            delete authTimers.current[providerId]
            if (status.connected) await hydrateModelOptions()
          }
        } catch (error) {
          delete authTimers.current[providerId]
          setMessageError(errorMessage(error))
        }
      }, 1000)
      authTimers.current[providerId] = timer
    },
    [clearAuthPoll, setMessageError],
  )

  const hydrateModelOptions = useCallback(async () => {
    try {
      const result = await fetchModelOptions(false)
      setModelOptions(result.models)
    } catch {
      // Model fields remain editable when optional catalog hydration is unavailable.
    }
  }, [])

  const refreshLocalStatus = useCallback(async () => {
    try {
      const result = await fetchLocalStatus()
      const next: Record<string, LocalProviderStatus> = {}
      for (const provider of result.providers) {
        next[provider.provider_id] = provider
      }
      setLocalStatus(next)
    } catch (error) {
      setMessageError(errorMessage(error))
    }
  }, [setMessageError])

  const refreshConnectedAccounts = useCallback(
    async (cfg: AdminConfig) => {
      const connected = cfg.provider_status.filter(
        (provider) => provider.kind === "connected_account",
      )
      const updates: Record<string, ConnectedAccountStatus> = {}
      await Promise.all(
        connected.map(async (provider) => {
          try {
            const status = await fetchConnectedAccount(provider.provider_id)
            updates[provider.provider_id] = status
            if (status.state === "connecting") pollConnectedAccount(provider.provider_id)
          } catch (error) {
            updates[provider.provider_id] = {
              state: "error",
              connected: false,
              label: "Needs attention",
              message: errorMessage(error),
            }
          }
        }),
      )
      setConnectedStatus((prev) => ({ ...prev, ...updates }))
    },
    [pollConnectedAccount],
  )

  const load = useCallback(async () => {
    setMessageOk("Loading admin config")
    try {
      const cfg = await fetchAdminConfig()
      setConfig(cfg)
      const initial: Record<string, string> = {}
      for (const field of cfg.fields) {
        initial[field.key] = initialFieldValue(field)
      }
      setValues(initial)
      await refreshConnectedAccounts(cfg)
      await hydrateModelOptions()
      try {
        const validation = await validateConfig({})
        if (!validation.valid && validation.errors.length) {
          setMessageError(validation.errors.join("; "))
        }
      } catch {
        // Validation on load is best-effort.
      }
      await refreshLocalStatus()
      setMessageOk("")
    } catch (error) {
      setMessageError(errorMessage(error))
    }
  }, [
    refreshConnectedAccounts,
    hydrateModelOptions,
    refreshLocalStatus,
    setMessageOk,
    setMessageError,
  ])

  useEffect(() => {
    void load()
    const onHashChange = () => setActiveView(viewFromPath(pathFromHash()))
    window.addEventListener("hashchange", onHashChange)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("hashchange", onHashChange)
      window.removeEventListener("keydown", onKeyDown)
      for (const timer of Object.values(authTimers.current)) clearTimeout(timer)
      authTimers.current = {}
    }
  }, [load])

  const handleSelectView = (viewId: string) => {
    const path = VIEW_GROUPS.find((view) => view.id === viewId)?.path ?? viewId
    setActiveView(viewId)
    window.location.hash = `/${path}`
  }

  const handleValidate = useCallback(async () => {
    try {
      const result = await validateConfig(changedValues())
      if (result.valid) setMessageOk("Config shape is valid")
      else setMessageError(result.errors.join("; "))
    } catch (error) {
      setMessageError(errorMessage(error))
    }
  }, [changedValues, setMessageError, setMessageOk])

  const handleApply = useCallback(async () => {
    setApplying(true)
    try {
      const result = await applyConfig(changedValues())
      if (!result.applied) {
        const errors = result.errors ?? []
        if (errors.length) setMessageError(errors.join("; "))
        return
      }
      const restart = result.restart
      if (restart?.required && restart.automatic) {
        setMessageOk("Applied. Restarting server...")
        setTimeout(() => {
          window.location.href = restart.admin_url || "/admin"
        }, 1600)
        return
      }
      const pending = restart?.required ? restart.fields ?? [] : result.pending_fields ?? []
      await load()
      setMessageOk(
        pending.length
          ? `Applied. Restart fcc-server to use: ${pending.join(", ")}`
          : "Applied",
      )
    } catch (error) {
      setMessageError(errorMessage(error))
    } finally {
      setApplying(false)
    }
  }, [changedValues, load, setMessageError, setMessageOk])

  const handleTestProvider = useCallback(
    async (providerId: string, done?: () => void) => {
      try {
        const result = await testProvider(providerId)
        if (result.ok) {
          setLocalStatus((prev) => ({
            ...prev,
            [providerId]: {
              provider_id: providerId,
              display_name: providerId,
              kind: "remote",
              status: "reachable",
              label: `${result.models.length} models`,
            },
          }))
          setModelOptions((prev) => [
            ...new Set([
              ...prev,
              ...result.models.map((model) => endpointModelOption(providerId, model)),
            ]),
          ])
          setMessageOk("Models refreshed")
        } else {
          setLocalStatus((prev) => ({
            ...prev,
            [providerId]: {
              provider_id: providerId,
              display_name: providerId,
              kind: "remote",
              status: "offline",
              label: result.error_type ?? "Offline",
            },
          }))
        }
      } catch (error) {
        setMessageError(errorMessage(error))
      } finally {
        done?.()
      }
    },
    [setMessageError, setMessageOk],
  )

  const handleFetchEndpointModels = useCallback(
    async (providerId: string): Promise<string[]> => {
      try {
        const result = await testProvider(providerId)
        if (!result.ok) {
          setMessageError(
            `Could not fetch models from ${providerId}: ${
              result.error_type ?? "request failed"
            }`,
          )
          return []
        }
        setModelOptions((prev) => [
          ...new Set([
            ...prev,
            ...result.models.map((model) => endpointModelOption(providerId, model)),
          ]),
        ])
        return result.models
      } catch (error) {
        setMessageError(
          `Could not fetch models from ${providerId}: ${errorMessage(error)}`,
        )
        return []
      }
    },
    [setMessageError],
  )

  const handleAddEndpointModels = useCallback(
    (providerId: string, models: string[]) => {
      if (models.length === 0) return
      setModelOptions((prev) => [
        ...new Set([
          ...prev,
          ...models.map((model) => endpointModelOption(providerId, model)),
        ]),
      ])
    },
    [],
  )

  const handleRefreshModels = useCallback(
    async (_providerId: string, done?: () => void) => {
      try {
        const result = await fetchModelOptions(true)
        setModelOptions(result.models)
        const failed = result.failed_providers ?? []
        if (failed.length) {
          setMessageWarn(`${result.models.length} models available; could not refresh ${failed.join(", ")}`)
        } else {
          setMessageOk(`${result.models.length} models available`)
        }
      } catch (error) {
        setMessageError(`Could not refresh models: ${errorMessage(error)}`)
      } finally {
        done?.()
      }
    },
    [setMessageError, setMessageOk, setMessageWarn],
  )

  const handleStartLogin = useCallback(
    async (providerId: string, mode: "browser" | "device") => {
      setConnectedLoading((prev) => ({ ...prev, [providerId]: true }))
      const popup = window.open("about:blank", "_blank")
      if (popup) popup.opener = null
      try {
        const status = await startConnectedAccountLogin(providerId, mode)
        setConnectedStatus((prev) => ({ ...prev, [providerId]: status }))
        const target = status.authorization_url || status.verification_url
        if (target && popup) {
          popup.location.replace(target)
        } else if (target) {
          window.open(target, "_blank", "noopener")
        } else if (popup) {
          popup.close()
        }
        if (status.state === "connecting") pollConnectedAccount(providerId)
      } catch (error) {
        if (popup) popup.close()
        setMessageError(errorMessage(error))
      } finally {
        setConnectedLoading((prev) => ({ ...prev, [providerId]: false }))
      }
    },
    [pollConnectedAccount, setMessageError],
  )

  const handleCancelLogin = useCallback(
    async (providerId: string) => {
      clearAuthPoll(providerId)
      try {
        const status = await cancelConnectedAccountLogin(providerId)
        setConnectedStatus((prev) => ({ ...prev, [providerId]: status }))
      } catch (error) {
        setMessageError(errorMessage(error))
      }
    },
    [clearAuthPoll, setMessageError],
  )

  const handleDisconnect = useCallback(
    async (providerId: string) => {
      if (!window.confirm("Disconnect this ChatGPT account from FCC?")) return
      clearAuthPoll(providerId)
      try {
        const status = await disconnectConnectedAccount(providerId)
        setConnectedStatus((prev) => ({ ...prev, [providerId]: status }))
        await hydrateModelOptions()
      } catch (error) {
        setMessageError(errorMessage(error))
      }
    },
    [clearAuthPoll, hydrateModelOptions, setMessageError],
  )

  const copyDeviceCode = useCallback(
    async (code: string) => {
      try {
        await navigator.clipboard.writeText(code)
        setMessageOk("Device code copied.")
      } catch {
        setMessage({ text: `Copy this device code: ${code}` })
      }
    },
    [setMessageOk],
  )

  if (!config) {
    return (
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-3 overflow-y-auto border-r p-4 md:flex">
          <Skeleton className="h-10 w-full" />
          <div className="mt-3 space-y-2">
            <Skeleton className="h-9 w-5/6" />
            <Skeleton className="h-9 w-4/6" />
            <Skeleton className="h-9 w-3/6" />
          </div>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-6">
          <div className="space-y-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </main>
      </div>
    )
  }

  const activeGroup =
    VIEW_GROUPS.find((view) => view.id === activeView) ?? VIEW_GROUPS[0]
  const ActiveIcon = activeGroup.icon

  return (
    <div className="flex min-h-screen">
      <Sidebar
        config={config}
        activeView={activeView}
        onSelectView={handleSelectView}
        className="sticky top-0 hidden h-screen md:flex"
      />
      {mobileNavOpen ? (
        <div
          className="fixed inset-0 z-50 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Admin navigation"
        >
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileNavOpen(false)}
          />
          <Sidebar
            config={config}
            activeView={activeView}
            onSelectView={handleSelectView}
            onNavigate={() => setMobileNavOpen(false)}
            className="animate-in slide-in-from-left absolute inset-y-0 left-0 shadow-2xl"
          />
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-md text-white/80 hover:bg-white/10 hover:text-white"
            onClick={() => setMobileNavOpen(false)}
          >
            <X className="size-5" />
          </button>
        </div>
      ) : null}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b bg-background/80 px-4 py-3 backdrop-blur-md md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Open navigation"
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu />
            </Button>
            <div className="hidden size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary md:flex">
              <ActiveIcon className="size-4.5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold tracking-tight leading-tight">
                {activeGroup.title}
              </h2>
              <p className="truncate text-xs text-muted-foreground">
                {activeGroup.description}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {config.version ? (
              <Badge
                variant="outline"
                className="hidden font-mono text-muted-foreground sm:inline-flex"
              >
                v{config.version}
              </Badge>
            ) : null}
            <ThemeToggle />
          </div>
        </header>

        <div className="flex-1 space-y-6 p-4 md:p-6">
          {activeView === "providers" && (
            <ProvidersView
              config={config}
              localStatus={localStatus}
              connectedStatus={connectedStatus}
              connectedLoading={connectedLoading}
              onTestProvider={handleTestProvider}
              onRefreshModels={handleRefreshModels}
              onStartLogin={handleStartLogin}
              onCancelLogin={handleCancelLogin}
              onDisconnect={handleDisconnect}
              onCopyDeviceCode={copyDeviceCode}
            />
          )}

          {activeView === "openai_compatible" && (
            <OpenAICompatibleView
              config={config}
              values={values}
              onValuesChange={setValues}
              localStatus={localStatus}
              onTestProvider={handleTestProvider}
              onFetchModels={handleFetchEndpointModels}
              onAddModels={handleAddEndpointModels}
              onMessage={showMessage}
            />
          )}

          {activeView === "usage" && <UsageView />}

          <ConfigView
            config={config}
            values={values}
            onValuesChange={setValues}
            modelOptions={modelOptions}
            onRefreshModels={handleRefreshModels}
            focusedView={activeView}
          />
        </div>

        <ActionBar
          configPath={config.paths.managed}
          dirtyCount={dirtyCount}
          message={message}
          applying={applying}
          onValidate={handleValidate}
          onApply={handleApply}
        />
      </main>
    </div>
  )
}

export function statusClass(status: string | undefined): StatusClass {
  return statusKind(status)
}