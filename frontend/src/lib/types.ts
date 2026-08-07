export interface ConfigOption {
  value: string
  label: string
}

export interface AdminField {
  key: string
  label: string
  section: string
  type: string
  value: string
  configured: boolean
  source: string
  locked: boolean
  secret: boolean
  advanced: boolean
  restart_required: boolean
  session_sensitive: boolean
  pool_supported: boolean
  options: ConfigOption[]
  description: string
  key_count?: number
  keys?: string[]
}

export interface AdminSection {
  id: string
  label: string
  description: string
  advanced: boolean
}

export interface AdminPathInfo {
  managed: string
  repo: string
  explicit: string | null
}

export interface ProviderStatus {
  provider_id: string
  display_name: string
  kind: "local" | "remote" | "connected_account"
  status: string
  label: string
  base_url?: string
  configuration?: string
}

export interface AdminConfig {
  sections: AdminSection[]
  fields: AdminField[]
  paths: AdminPathInfo
  provider_status: ProviderStatus[]
  version: string
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export interface ApplyResult {
  applied: boolean
  errors?: string[]
  pending_fields?: string[]
  restart?: {
    required: boolean
    automatic: boolean
    admin_url?: string
    fields?: string[]
  }
}

export interface LocalProviderStatus extends ProviderStatus {
  status_code?: number
  error_type?: string
}

export interface LocalStatusResult {
  providers: LocalProviderStatus[]
}

export interface ConnectedAccountStatus {
  state: "disconnected" | "connecting" | "connected" | "error"
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

export interface ModelOptionsResult {
  models: string[]
  failed_providers: string[]
}

export interface PoolKeysResult {
  key: string
  keys: string[]
}

export interface ProviderTestResult {
  ok: boolean
  models: string[]
  error_type?: string
}

export interface OpenAICompatibleInstance {
  base_url: string
  api_keys: string
  proxy: string
  /** Model ids applied to this endpoint; persisted on Apply. */
  models?: string[]
}

export interface UsageStats {
  total_requests: number
  total_input_tokens: number
  total_output_tokens: number
  total_cache_creation_tokens: number
  total_cache_read_tokens: number
  total_reasoning_tokens: number
  errors: number
  cancelled: number
  tpm: number
  tps: number
}

export interface UsageRecord {
  request_id: string
  timestamp: number
  provider: string
  provider_model: string
  gateway_model: string
  wire_api: "messages" | "responses"
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  reasoning_tokens: number
  duration_ms: number
  status: "success" | "error" | "cancelled"
  error_type: string | null
  prompt: string
}

export interface UsageResult {
  stats: UsageStats
  records: UsageRecord[]
}
