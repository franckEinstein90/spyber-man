import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { THEME_OPTIONS, type ThemeMode } from "@/lib/theme"

export function SettingsPage({
  mode,
  onModeChange,
}: {
  mode: ThemeMode
  onModeChange: (mode: ThemeMode) => void
}) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Choose how Spyber looks on this device.</p>
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Appearance</h2>
        <div className="grid gap-2" role="radiogroup" aria-label="Color mode">
          {THEME_OPTIONS.map((option) => {
            const selected = option.id === mode
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onModeChange(option.id)}
                className={cn(
                  "flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
                  selected ? "border-primary bg-accent" : "hover:bg-muted/60",
                )}
              >
                <span>
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{option.description}</span>
                </span>
                {selected ? <Check className="mt-0.5 size-4 shrink-0" aria-hidden /> : null}
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
