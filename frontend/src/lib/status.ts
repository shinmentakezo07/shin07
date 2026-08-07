/** Dot color for a provider/endpoint status badge, shared by all status cards. */
export function statusDotClass(status: string | undefined): string {
  if (["configured", "reachable", "running", "connected"].includes(status ?? ""))
    return "bg-emerald-500"
  if (
    ["missing_key", "missing_config", "missing_url", "unknown", "connecting"].includes(
      status ?? "",
    )
  )
    return "bg-amber-500"
  if (["offline", "error"].includes(status ?? "")) return "bg-red-500"
  return "bg-muted-foreground/50"
}
