import { useCallback, useEffect, useRef, useState } from "react"

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

export const MASKED_SECRET = "********"

interface ViewGroup {
  id: string
  label: string
  title: string
  path: string
  sections: string[]
}

export const VIEW_GROUPS: ViewGroup[] = [
  {
    id: "providers",
    label: "Providers",
    title: "Providers",
    path: "providers",
    sections: ["providers", "runtime"],
  },
  {
    id: "model_config",
    label: "Model Config",
    title: "Model Config",
    path: "model-config",
    sections: ["models", "reasoning", "web_tools"],
  },
  {
    id: "openai_compatible",
    label: "OpenAI-Compatible",
    title: "OpenAI-Compatible Endpoints",
    path: "openai-compatible",
    sections: [],
  },
  {
    id: "messaging",
    label: "Messaging",
    title: "Messaging",
    path: "messaging",
    sections: ["messaging", "voice"],
  },
]

function viewFromPath(path: string): string {
  return VIEW_GROUPS.find((view) => view.path === path)?.id ?? "providers"
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
    return () => {
      window.removeEventListener("hashchange", onHashChange)
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
              ...result.models.map((model) => `${providerId}/${model}`),
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
            ...result.models.map((model) => `${providerId}/${model}`),
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
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading admin config...</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        config={config}
        activeView={activeView}
        onSelectView={handleSelectView}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-2xl font-semibold">
            {VIEW_GROUPS.find((view) => view.id === activeView)?.title ?? "Providers"}
          </h2>
          {config.version ? (
            <span className="rounded-full border border-input px-2.5 py-0.5 text-xs text-muted-foreground">
              v{config.version}
            </span>
          ) : null}
        </header>

        <div className="flex-1 space-y-8 p-6">
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
              onMessage={showMessage}
            />
          )}

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