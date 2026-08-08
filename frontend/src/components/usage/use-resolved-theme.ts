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

/** Concrete palette for canvas rendering, matched to the app's CSS tokens. */
export function resolveChartTheme(theme: ResolvedTheme) {
  const dark = theme === "dark"
  return {
    text: dark ? "#f5f5f4" : "#292524",
    muted: dark ? "#a8a29e" : "#78716c",
    grid: dark ? "#292524" : "#e7e5e4",
    card: dark ? "#1c1917" : "#ffffff",
  }
}
