import type {
  AdminConfig,
  ConnectedAccountStatus,
  LocalProviderStatus,
  ProviderStatus,
} from "@/lib/types"

import {
  ConnectedAccountCard,
  ProviderCard,
  type ConnectedState,
  type ProviderState,
} from "./ProviderCards"

interface ProvidersViewProps {
  config: AdminConfig
  localStatus: Record<string, LocalProviderStatus>
  connectedStatus: Record<string, ConnectedAccountStatus>
  connectedLoading: Record<string, boolean>
  onTestProvider: (providerId: string, done: () => void) => void
  onRefreshModels: (providerId: string, done: () => void) => void
  onStartLogin: (providerId: string, mode: "browser" | "device") => void
  onCancelLogin: (providerId: string) => void
  onDisconnect: (providerId: string) => void
  onCopyDeviceCode: (code: string) => void
}

export function ProvidersView({
  config,
  localStatus,
  connectedStatus,
  connectedLoading,
  onTestProvider,
  onRefreshModels,
  onStartLogin,
  onCancelLogin,
  onDisconnect,
  onCopyDeviceCode,
}: ProvidersViewProps) {
  const connectedProviders = config.provider_status.filter(
    (provider) => provider.kind === "connected_account",
  )
  const remoteProviders = config.provider_status.filter(
    (provider) => provider.kind !== "connected_account",
  )

  const providerState = (provider: ProviderStatus): ProviderState => {
    const local = localStatus[provider.provider_id]
    const descriptor = config.provider_status.find(
      (candidate) => candidate.provider_id === provider.provider_id,
    )
    if (local) {
      return {
        status: local.status,
        label: local.label,
        baseUrl:
          local.status_code !== undefined
            ? `${local.base_url} returned HTTP ${local.status_code}`
            : local.base_url,
      }
    }
    return {
      status: descriptor?.status ?? "unknown",
      label: descriptor?.label ?? "Not checked",
      baseUrl: descriptor?.base_url ?? "",
    }
  }

  const defaultConnectedState = (provider: ProviderStatus): ConnectedState =>
    connectedStatus[provider.provider_id] ?? {
      state: "disconnected",
      connected: false,
      label: "Not connected",
    }

  return (
    <>
      {connectedProviders.length > 0 && (
        <section className="space-y-4" aria-label="Connected accounts">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">Connected accounts</h3>
            <p className="text-sm text-muted-foreground">
              Use an existing subscription without storing credentials in .env.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {connectedProviders.map((provider) => (
              <ConnectedAccountCard
                key={provider.provider_id}
                provider={provider}
                status={defaultConnectedState(provider)}
                loading={connectedLoading[provider.provider_id] === true}
                onStartLogin={onStartLogin}
                onCancelLogin={onCancelLogin}
                onDisconnect={onDisconnect}
                onCopyDeviceCode={onCopyDeviceCode}
              />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4" aria-label="Provider status">
        <h3 className="text-lg font-semibold tracking-tight">Providers</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {remoteProviders.map((provider) => (
            <ProviderCard
              key={provider.provider_id}
              provider={provider}
              state={providerState(provider)}
              onTest={(providerId, done) => {
                if (provider.kind === "local") {
                  onTestProvider(providerId, done)
                } else {
                  onRefreshModels(providerId, done)
                }
              }}
            />
          ))}
        </div>
      </section>
    </>
  )
}