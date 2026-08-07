import { useEffect, useState } from "react"

type ResolvedTheme = "light" | "dark"

function readResolvedTheme(): ResolvedTheme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

/**
 * Tracks the resolved light/dark appearance so canvas-rendered charts
 * (ECharts cannot read CSS custom properties) can re-render on theme change.
 */
export function useResolvedTheme(): ResolvedTheme {
  const [theme, setTheme] = useState<ResolvedTheme>(readResolvedTheme)
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readResolvedTheme()))
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })
    return () => observer.disconnect()
  }, [])
  return theme
}

/** Concrete palette for canvas rendering, matched to the stone/amber theme. */
export function resolveChartTheme(theme: ResolvedTheme) {
  const dark = theme === "dark"
  return {
    text: dark ? "#e7e5e4" : "#44403c",
    muted: dark ? "#a8a29e" : "#a8a29e",
    grid: dark ? "#3e3a36" : "#e7e5e4",
    card: dark ? "#1c1917" : "#ffffff",
  }
}
