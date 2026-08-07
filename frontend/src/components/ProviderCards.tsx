import { useState } from "react"

import { statusClass } from "@/App"
import type { ProviderStatus } from "@/lib/types"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Card } from "./ui/card"

export interface ProviderState {
  status: string
  label: string
  baseUrl?: string
}

interface ProviderCardProps {
  provider: ProviderStatus
  state: ProviderState
  onTest: (providerId: string, done: () => void) => void
}

export function ProviderCard({ provider, state, onTest }: ProviderCardProps) {
  const [pending, setPending] = useState(false)
  const isLocal = provider.kind === "local"
  const meta = isLocal
    ? state.baseUrl || (state.baseUrl !== undefined ? "No local URL enabled" : "")
    : provider.configuration || ""

  const label = isLocal ? "Test" : "Refresh models"

  return (
    <Card className="flex flex-row items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <strong className="text-sm">{provider.display_name || provider.provider_id}</strong>
          <Badge variant={statusClass(state.status)}>{state.label}</Badge>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">{meta}</p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() => {
          setPending(true)
          onTest(provider.provider_id, () => setPending(false))
        }}
      >
        {pending ? (isLocal ? "Testing" : "Refreshing") : label}
      </Button>
    </Card>
  )
}

export interface ConnectedState {
  state: string
  connected: boolean
  label: string
  message?: string
  email?: string
  model_count?: number
  mode?: string
  user_code?: string
  verification_url?: string
  authorization_url?: string
}

interface ConnectedAccountCardProps {
  provider: ProviderStatus
  status: ConnectedState
  loading: boolean
  onStartLogin: (providerId: string, mode: "browser" | "device") => void
  onCancelLogin: (providerId: string) => void
  onDisconnect: (providerId: string) => void
  onCopyDeviceCode: (code: string) => void
}

export function ConnectedAccountCard({
  provider,
  status,
  loading,
  onStartLogin,
  onCancelLogin,
  onDisconnect,
  onCopyDeviceCode,
}: ConnectedAccountCardProps) {
  const connected = status.connected === true
  const connecting = status.state === "connecting"
  const target = status.authorization_url || status.verification_url

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <strong className="text-sm">{provider.display_name || provider.provider_id}</strong>
        <Badge variant={statusClass(status.state)}>{status.label}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">{statusMessage(status)}</p>
      <div className="flex flex-wrap gap-2">
        {connecting ? (
          <>
            {target ? (
              <Button variant="default" size="sm" onClick={() => window.open(target, "_blank", "noopener")}>
                Open sign-in
              </Button>
            ) : null}
            {status.mode === "device" && status.user_code ? (
              <Button variant="secondary" size="sm" onClick={() => onCopyDeviceCode(status.user_code!)}>
                Copy code
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" onClick={() => onCancelLogin(provider.provider_id)}>
              Cancel
            </Button>
          </>
        ) : connected ? (
          <>
            <Button variant="secondary" size="sm" onClick={() => onStartLogin(provider.provider_id, "browser")}>
              Reconnect
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onDisconnect(provider.provider_id)}>
              Disconnect
            </Button>
          </>
        ) : (
          <>
            <Button variant="default" size="sm" disabled={loading} onClick={() => onStartLogin(provider.provider_id, "browser")}>
              Connect
            </Button>
            <Button variant="secondary" size="sm" disabled={loading} onClick={() => onStartLogin(provider.provider_id, "device")}>
              Use device code
            </Button>
          </>
        )}
      </div>
    </Card>
  )
}

function statusMessage(status: ConnectedState): string {
  if (status.connected) {
    const identity = status.email || "ChatGPT subscription connected"
    const models = Number.isInteger(status.model_count)
      ? ` ${status.model_count} model${status.model_count === 1 ? "" : "s"} available.`
      : ""
    const error = status.message ? ` ${status.message}` : ""
    return `${identity}.${models}${error} Restart your agent to refresh its model picker.`
  }
  if (status.mode === "device" && status.user_code) {
    return `Enter code ${status.user_code} at ${status.verification_url}`
  }
  if (status.state === "connecting") {
    return "Finish signing in, then return to this page."
  }
  return status.message || "Connect a ChatGPT account to discover subscription models."
}