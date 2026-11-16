import { useEffect, useState } from "react"

export type Theme = "dark" | "light"

const STORAGE_KEY = "sharp.theme"

function applyThemeToDom(theme: Theme) {
  if (typeof document === "undefined") return
  document.documentElement.dataset.theme = theme
  document.documentElement.classList.toggle("light", theme === "light")
}

export function getStoredTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === "light" || saved === "dark") return saved
  } catch {
    // ignore storage errors
  }
  return "dark"
}

export function setStoredTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
    applyThemeToDom(theme)
    window.dispatchEvent(new CustomEvent("sharp-theme-change", { detail: theme }))
  } catch {
    applyThemeToDom(theme)
  }
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(getStoredTheme)

  useEffect(() => {
    applyThemeToDom(theme)
  }, [theme])

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<Theme>
      if (custom.detail === "light" || custom.detail === "dark") {
        setTheme(custom.detail)
      }
    }
    window.addEventListener("sharp-theme-change", handler)
    return () => window.removeEventListener("sharp-theme-change", handler)
  }, [])

  const updateTheme = (next: Theme) => {
    setTheme(next)
    setStoredTheme(next)
  }

  return [theme, updateTheme]
}
