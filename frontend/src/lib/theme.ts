export type ThemeMode = "light" | "dark" | "system"

export const THEME_KEY = "spyber-theme"

export const THEME_OPTIONS: { id: ThemeMode; label: string; description: string }[] = [
  { id: "light", label: "Light", description: "Bright background and dark text." },
  { id: "dark", label: "Dark", description: "Dim background and light text." },
  { id: "system", label: "System", description: "Follow this device's appearance setting." },
]

export function readThemeMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === "light" || stored === "dark" || stored === "system") return stored
  } catch {
    // Ignore storage failures and use the default.
  }
  return "light"
}

export function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

export function applyThemeMode(mode: ThemeMode): void {
  const dark = mode === "dark" || (mode === "system" && prefersDark())
  document.documentElement.classList.toggle("dark", dark)
  document.documentElement.style.colorScheme = dark ? "dark" : "light"
}

export function saveThemeMode(mode: ThemeMode): void {
  localStorage.setItem(THEME_KEY, mode)
  applyThemeMode(mode)
}
