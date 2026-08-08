import type { UsageRecord } from "./types"

export const LIVE_WINDOW_SECONDS = 60

export const RANGES = [
  { key: "15m", label: "15m", seconds: 15 * 60 },
  { key: "1h", label: "1h", seconds: 60 * 60 },
  { key: "6h", label: "6h", seconds: 6 * 60 * 60 },
  { key: "24h", label: "24h", seconds: 24 * 60 * 60 },
  { key: "all", label: "All", seconds: null },
] as const

export type RangeKey = (typeof RANGES)[number]["key"]

// Validated categorical palette (dataviz skill): slot order is the CVD-safety
// mechanism — never reorder. Both modes are selected against the app's card
// surfaces (light #ffffff, dark #1c1917).
export const LIGHT_CHART_COLORS = [
  "#2a78d6", // 1 blue
  "#eb6834", // 2 orange
  "#1baf7a", // 3 aqua
  "#eda100", // 4 yellow
  "#e87ba4", // 5 magenta
  "#008300", // 6 green
  "#4a3aa7", // 7 violet
  "#e34948", // 8 red
] as const

export const DARK_CHART_COLORS = [
  "#3987e5", // 1 blue
  "#d95926", // 2 orange
  "#199e70", // 3 aqua
  "#c98500", // 4 yellow
  "#d55181", // 5 magenta
  "#008300", // 6 green
  "#9085e9", // 7 violet
  "#e66767", // 8 red
] as const

/** Light-mode alias for call sites that have no theme context. */
export const CHART_COLORS = LIGHT_CHART_COLORS

export function chartPalette(dark: boolean): readonly string[] {
  return dark ? DARK_CHART_COLORS : LIGHT_CHART_COLORS
}

// Donut token slices map to categorical slots (input→1 … reasoning→5).
export const TOKEN_COLORS = {
  input: "#2a78d6",
  output: "#eb6834",
  cacheRead: "#1baf7a",
  cacheWrite: "#eda100",
  reasoning: "#e87ba4",
} as const

export const TOKEN_COLORS_DARK = {
  input: "#3987e5",
  output: "#d95926",
  cacheRead: "#199e70",
  cacheWrite: "#c98500",
  reasoning: "#d55181",
} as const

export type TokenSlice = keyof typeof TOKEN_COLORS

export function tokenColor(key: TokenSlice, dark: boolean): string {
  return (dark ? TOKEN_COLORS_DARK : TOKEN_COLORS)[key]
}

// Fixed status palette (dataviz skill): never themed, always paired with
// icon + label in the UI.
export const STATUS_COLORS = {
  success: "#0ca30c",
  error: "#d03b3b",
  cancelled: "#fab219",
} as const

// Blue sequential ramp for the hour heatmap (skill steps; ordinal-safe in both
// modes: light starts ≥ step 250, dark ends ≤ step 600).
export const HEATMAP_LEVEL_COLORS_LIGHT = ["#86b6ef", "#6da7ec", "#3987e5", "#1c5cab"]
export const HEATMAP_LEVEL_COLORS_DARK = ["#5598e7", "#2a78d6", "#256abf", "#184f95"]
export const HEATMAP_EMPTY_LIGHT = "#f0efec"
export const HEATMAP_EMPTY_DARK = "#383835"
export const HEATMAP_PEAK_RING_LIGHT = "#2a78d6"
export const HEATMAP_PEAK_RING_DARK = "#5598e7"
/** Dark-blue ink for labels on the lightest heatmap levels (light mode only). */
export const HEATMAP_LABEL_ON_LIGHT = "#1c5cab"

export interface TimeBucket {
  start: number
  label: string
  count: number
  success: number
  error: number
  cancelled: number
  tokens: number
  successTokens: number
  errorTokens: number
  cancelledTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens: number
  latencySum: number
  latencyCount: number
  bucketSeconds: number
}

export interface Kpis {
  requests: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens: number
  errors: number
  cancelled: number
  tpm: number
  tps: number
  avgLatencyMs: number
  errorRate: number
}

export interface DonutDatum {
  name: string
  value: number
  color: string
}

export interface EndpointUsage {
  name: string
  tokens: number
  requests: number
  errors: number
}

export interface SankeyNode {
  name: string
  display: string
  category: 0 | 1 | 2
}

export interface SankeyLink {
  source: string
  target: string
  value: number
}

export interface HeatmapCell {
  hour: number
  day: number
  count: number
  tokens: number
  latencySum: number
  latencyCount: number
}

export const HEATMAP_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const
export const HEATMAP_HOURS = Array.from({ length: 24 }, (_, index) =>
  String(index).padStart(2, "0"),
)

export function filterByRange(
  records: UsageRecord[],
  range: RangeKey,
  now: number,
): UsageRecord[] {
  const option = RANGES.find((candidate) => candidate.key === range)
  if (!option || option.seconds === null) return records
  return records.filter((record) => record.timestamp >= now - option.seconds)
}

function chooseBucketSeconds(spanSeconds: number): number {
  if (spanSeconds <= 5 * 60) return 10
  if (spanSeconds <= 30 * 60) return 30
  if (spanSeconds <= 2 * 60 * 60) return 60
  if (spanSeconds <= 12 * 60 * 60) return 300
  if (spanSeconds <= 48 * 60 * 60) return 900
  return 3600
}

function bucketLabel(start: number, bucketSeconds: number): string {
  const date = new Date(start * 1000)
  if (bucketSeconds < 60) {
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  }
  if (bucketSeconds < 3600) {
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function buildBuckets(records: UsageRecord[], now: number): TimeBucket[] {
  if (records.length === 0) return []
  let minTs = Number.POSITIVE_INFINITY
  let maxTs = 0
  for (const record of records) {
    if (record.timestamp < minTs) minTs = record.timestamp
    if (record.timestamp > maxTs) maxTs = record.timestamp
  }
  const span = Math.max(now - minTs, maxTs - minTs, 1)
  let bucketSeconds = chooseBucketSeconds(span)
  while (span / bucketSeconds > 180) bucketSeconds *= 2

  const first = Math.floor(minTs / bucketSeconds) * bucketSeconds
  const last = Math.max(Math.floor(now / bucketSeconds) * bucketSeconds, first)
  const buckets: TimeBucket[] = []
  const byStart = new Map<number, TimeBucket>()
  for (let start = first; start <= last; start += bucketSeconds) {
    const bucket: TimeBucket = {
      start,
      label: bucketLabel(start, bucketSeconds),
      count: 0,
      success: 0,
      error: 0,
      cancelled: 0,
      tokens: 0,
      successTokens: 0,
      errorTokens: 0,
      cancelledTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      latencySum: 0,
      latencyCount: 0,
      bucketSeconds,
    }
    buckets.push(bucket)
    byStart.set(start, bucket)
  }
  for (const record of records) {
    const bucket = byStart.get(Math.floor(record.timestamp / bucketSeconds) * bucketSeconds)
    if (!bucket) continue
    const tokens = record.input_tokens + record.output_tokens
    bucket.count += 1
    bucket.tokens += tokens
    bucket.cacheReadTokens += record.cache_read_tokens
    bucket.cacheWriteTokens += record.cache_creation_tokens
    bucket.reasoningTokens += record.reasoning_tokens
    bucket.latencySum += record.duration_ms
    bucket.latencyCount += 1
    if (record.status === "success") {
      bucket.success += 1
      bucket.successTokens += tokens
    } else if (record.status === "error") {
      bucket.error += 1
      bucket.errorTokens += tokens
    } else {
      bucket.cancelled += 1
      bucket.cancelledTokens += tokens
    }
  }
  return buckets
}

export function computeKpis(records: UsageRecord[], now: number): Kpis {
  let requests = 0
  let inputTokens = 0
  let outputTokens = 0
  let cacheReadTokens = 0
  let cacheWriteTokens = 0
  let reasoningTokens = 0
  let errors = 0
  let cancelled = 0
  let latencySum = 0
  let liveInputTokens = 0
  let liveOutputTokens = 0
  const liveCutoff = now - LIVE_WINDOW_SECONDS
  for (const record of records) {
    requests += 1
    inputTokens += record.input_tokens
    outputTokens += record.output_tokens
    cacheReadTokens += record.cache_read_tokens
    cacheWriteTokens += record.cache_creation_tokens
    reasoningTokens += record.reasoning_tokens
    latencySum += record.duration_ms
    if (record.status === "error") errors += 1
    else if (record.status === "cancelled") cancelled += 1
    if (record.timestamp >= liveCutoff) {
      liveInputTokens += record.input_tokens
      liveOutputTokens += record.output_tokens
    }
  }
  return {
    requests,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    reasoningTokens,
    errors,
    cancelled,
    tpm: ((liveInputTokens + liveOutputTokens) / LIVE_WINDOW_SECONDS) * 60,
    tps: liveOutputTokens / LIVE_WINDOW_SECONDS,
    avgLatencyMs: requests > 0 ? latencySum / requests : 0,
    errorRate: requests > 0 ? errors / requests : 0,
  }
}

export function buildTokenMix(kpis: Kpis, dark: boolean): DonutDatum[] {
  return [
    { name: "Input", value: kpis.inputTokens, color: tokenColor("input", dark) },
    { name: "Output", value: kpis.outputTokens, color: tokenColor("output", dark) },
    { name: "Cache read", value: kpis.cacheReadTokens, color: tokenColor("cacheRead", dark) },
    { name: "Cache write", value: kpis.cacheWriteTokens, color: tokenColor("cacheWrite", dark) },
    { name: "Reasoning", value: kpis.reasoningTokens, color: tokenColor("reasoning", dark) },
  ].filter((datum) => datum.value > 0)
}

function buildTop(
  records: UsageRecord[],
  keyOf: (record: UsageRecord) => string,
  limit: number,
): EndpointUsage[] {
  const byName = new Map<string, EndpointUsage>()
  for (const record of records) {
    const name = keyOf(record) || "(unknown)"
    const entry = byName.get(name) ?? { name, tokens: 0, requests: 0, errors: 0 }
    entry.tokens += record.input_tokens + record.output_tokens
    entry.requests += 1
    if (record.status === "error") entry.errors += 1
    byName.set(name, entry)
  }
  return [...byName.values()].sort((a, b) => b.tokens - a.tokens).slice(0, limit)
}

export function buildTopByModel(records: UsageRecord[], limit = 6): EndpointUsage[] {
  return buildTop(
    records,
    (record) => record.gateway_model || record.provider_model || "(no model)",
    limit,
  )
}

export function buildTopByProvider(records: UsageRecord[], limit = 6): EndpointUsage[] {
  return buildTop(records, (record) => record.provider, limit)
}

const MODEL_LIMIT = 5
const PROVIDER_LIMIT = 4

export function buildRoutingSankey(records: UsageRecord[]): {
  nodes: SankeyNode[]
  links: SankeyLink[]
} {
  const wireCounts = new Map<string, number>()
  const modelCounts = new Map<string, number>()
  const providerCounts = new Map<string, number>()
  for (const record of records) {
    const wire = record.wire_api || "unknown"
    const model = record.gateway_model || record.provider_model || "(no model)"
    const provider = record.provider || "(unknown)"
    wireCounts.set(wire, (wireCounts.get(wire) ?? 0) + 1)
    modelCounts.set(model, (modelCounts.get(model) ?? 0) + 1)
    providerCounts.set(provider, (providerCounts.get(provider) ?? 0) + 1)
  }
  const topModels = [...modelCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MODEL_LIMIT)
  const topProviders = [...providerCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, PROVIDER_LIMIT)
  const modelBucket = (name: string): string =>
    topModels.some(([candidate]) => candidate === name) ? `gw:${name}` : "gw:Other"
  const providerBucket = (name: string): string =>
    topProviders.some(([candidate]) => candidate === name) ? `pv:${name}` : "pv:Other"

  const linkCounts = new Map<string, number>()
  const addLink = (source: string, target: string) => {
    const key = `${source}\u0000${target}`
    linkCounts.set(key, (linkCounts.get(key) ?? 0) + 1)
  }
  for (const record of records) {
    const wire = record.wire_api || "unknown"
    const model = record.gateway_model || record.provider_model || "(no model)"
    const provider = record.provider || "(unknown)"
    addLink(wire, modelBucket(model))
    addLink(modelBucket(model), providerBucket(provider))
  }

  const nodes: SankeyNode[] = []
  for (const wire of wireCounts.keys()) {
    nodes.push({ name: wire, display: wire, category: 0 })
  }
  for (const [name] of topModels) {
    nodes.push({ name: `gw:${name}`, display: name, category: 1 })
  }
  if (modelCounts.size > MODEL_LIMIT) {
    nodes.push({ name: "gw:Other", display: "Other models", category: 1 })
  }
  for (const [name] of topProviders) {
    nodes.push({ name: `pv:${name}`, display: name, category: 2 })
  }
  if (providerCounts.size > PROVIDER_LIMIT) {
    nodes.push({ name: "pv:Other", display: "Other providers", category: 2 })
  }
  const links: SankeyLink[] = [...linkCounts.entries()]
    .map(([key, value]) => {
      const [source, target] = key.split("\u0000")
      return { source, target, value }
    })
    .sort((a, b) => b.value - a.value)
  return { nodes, links }
}

export function buildHourHeatmap(records: UsageRecord[]): HeatmapCell[] {
  const cells = new Map<number, HeatmapCell>()
  for (const record of records) {
    const date = new Date(record.timestamp * 1000)
    const day = (date.getDay() + 6) % 7
    const hour = date.getHours()
    const key = day * 24 + hour
    const cell = cells.get(key) ?? {
      hour,
      day,
      count: 0,
      tokens: 0,
      latencySum: 0,
      latencyCount: 0,
    }
    cell.count += 1
    cell.tokens += record.input_tokens + record.output_tokens
    cell.latencySum += record.duration_ms
    cell.latencyCount += 1
    cells.set(key, cell)
  }
  const all: HeatmapCell[] = []
  for (let day = 0; day < 7; day += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      all.push(
        cells.get(day * 24 + hour) ?? {
          hour,
          day,
          count: 0,
          tokens: 0,
          latencySum: 0,
          latencyCount: 0,
        },
      )
    }
  }
  return all
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(value)
}

export function formatDuration(durationMs: number): string {
  if (durationMs >= 1000) return `${(durationMs / 1000).toFixed(1)}s`
  return `${durationMs}ms`
}

export function formatRate(rate: number): string {
  if (rate <= 0) return "0%"
  return `${(rate * 100).toFixed(1)}%`
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString()
}

export function formatShortTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}
