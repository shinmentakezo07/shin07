import type {
  AdminConfig,
  ApplyResult,
  ConnectedAccountStatus,
  LocalStatusResult,
  ModelOptionsResult,
  PoolKeysResult,
  ProviderTestResult,
  ValidationResult,
} from "./types"

export class ApiError extends Error {}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
    cache: "no-store",
  })
  if (!response.ok) {
    let detail = ""
    try {
      const payload = await response.json()
      detail = typeof payload.detail === "string" ? payload.detail : ""
    } catch {
      // The status remains useful when an upstream proxy returns a non-JSON page.
    }
    throw new ApiError(detail || `${response.status} ${response.statusText}`)
  }
  return response.json() as Promise<T>
}

export function fetchAdminConfig(): Promise<AdminConfig> {
  return api<AdminConfig>("/admin/api/config")
}

export function validateConfig(values: Record<string, string>): Promise<ValidationResult> {
  return api<ValidationResult>("/admin/api/config/validate", {
    method: "POST",
    body: JSON.stringify({ values }),
  })
}

export function applyConfig(values: Record<string, string>): Promise<ApplyResult> {
  return api<ApplyResult>("/admin/api/config/apply", {
    method: "POST",
    body: JSON.stringify({ values }),
  })
}

export async function fetchLocalStatus(): Promise<LocalStatusResult> {
  return api<LocalStatusResult>("/admin/api/providers/local-status")
}

export function testProvider(providerId: string): Promise<ProviderTestResult> {
  return api<ProviderTestResult>(`/admin/api/providers/${providerId}/test`, {
    method: "POST",
    body: "{}",
  })
}

export function fetchConnectedAccount(providerId: string): Promise<ConnectedAccountStatus> {
  return api<ConnectedAccountStatus>(`/admin/api/providers/${providerId}/auth`)
}

export function startConnectedAccountLogin(
  providerId: string,
  mode: "browser" | "device",
): Promise<ConnectedAccountStatus> {
  return api<ConnectedAccountStatus>(`/admin/api/providers/${providerId}/auth/login`, {
    method: "POST",
    body: JSON.stringify({ mode }),
  })
}

export function cancelConnectedAccountLogin(providerId: string): Promise<ConnectedAccountStatus> {
  return api<ConnectedAccountStatus>(`/admin/api/providers/${providerId}/auth/cancel`, {
    method: "POST",
  })
}

export function disconnectConnectedAccount(providerId: string): Promise<ConnectedAccountStatus> {
  return api<ConnectedAccountStatus>(`/admin/api/providers/${providerId}/auth`, {
    method: "DELETE",
  })
}

export function fetchModelOptions(refresh = false): Promise<ModelOptionsResult> {
  const path = refresh ? "/admin/api/models/refresh" : "/admin/api/models"
  return api<ModelOptionsResult>(path, { method: refresh ? "POST" : "GET" })
}

export function fetchPoolKeys(fieldKey: string): Promise<PoolKeysResult> {
  return api<PoolKeysResult>(`/admin/api/pools/${encodeURIComponent(fieldKey)}`)
}