import { useEffect, useState } from "react"
import { ExternalLink, Trash2 } from "lucide-react"
import { ContextMenu } from "radix-ui"

export interface GalleryImage {
  filename: string
  url: string | null
  visitedAt: string | null
}

function pageLabel(image: GalleryImage): string {
  if (!image.url) return image.filename
  try {
    return new URL(image.url).hostname.replace(/^www\./, "")
  } catch {
    return image.url
  }
}

function whenLabel(value: string | null): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function openStoredPage(url: string) {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return
  window.open(parsed.href, "_blank", "noopener,noreferrer")
}

const menuItemClass =
  "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-muted"

export function ImagesPage({
  onOpen,
  onDeleted,
}: {
  onOpen: (image: GalleryImage) => void
  onDeleted?: (filename: string) => void
}) {
  const [images, setImages] = useState<GalleryImage[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/screenshots")
      .then(async (response) => {
        const body = (await response.json()) as { items?: GalleryImage[]; error?: string }
        if (!response.ok) throw new Error(body.error || "Could not load screenshots.")
        return body.items ?? []
      })
      .then((items) => {
        if (!cancelled) setImages(items)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load screenshots.")
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function deleteImage(image: GalleryImage) {
    if (deleting) return
    const label = pageLabel(image)
    if (!window.confirm(`Delete the screenshot of ${label}?`)) return
    setDeleting(image.filename)
    setError(null)
    try {
      const response = await fetch(`/api/screenshots/${encodeURIComponent(image.filename)}`, { method: "DELETE" })
      const body = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(body.error || "Could not delete that screenshot.")
      setImages((current) => current?.filter((item) => item.filename !== image.filename) ?? [])
      onDeleted?.(image.filename)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete that screenshot.")
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Images</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every screenshot stored by Spyber. Double-click one to open it. Right-click to open the page or delete the image.
        </p>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {images && images.length === 0 ? (
        <p className="text-sm text-muted-foreground">No screenshots yet. Crawl a page to capture one.</p>
      ) : null}
      {images && images.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((image) => (
            <ContextMenu.Root key={image.filename}>
              <ContextMenu.Trigger asChild>
                <button
                  type="button"
                  className="bg-card hover:bg-muted/40 overflow-hidden rounded-xl text-left ring-1 ring-foreground/10"
                  onDoubleClick={() => onOpen(image)}
                >
                  <img
                    src={`/screengrabs/${encodeURIComponent(image.filename)}`}
                    alt={pageLabel(image)}
                    className="aspect-[4/3] w-full object-cover object-top"
                  />
                  <span className="block px-3 py-2">
                    <span className="block truncate text-sm">{pageLabel(image)}</span>
                    <span className="text-muted-foreground block truncate text-xs">{whenLabel(image.visitedAt)}</span>
                  </span>
                </button>
              </ContextMenu.Trigger>
              <ContextMenu.Portal>
                <ContextMenu.Content className="bg-popover text-popover-foreground z-50 min-w-44 rounded-xl border p-1 shadow-md">
                  <ContextMenu.Item
                    className={menuItemClass}
                    disabled={!image.url}
                    onSelect={() => {
                      if (image.url) openStoredPage(image.url)
                    }}
                  >
                    <ExternalLink className="size-4" />
                    Open page
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className={`${menuItemClass} text-destructive`}
                    disabled={deleting === image.filename}
                    onSelect={() => void deleteImage(image)}
                  >
                    <Trash2 className="size-4" />
                    Delete image
                  </ContextMenu.Item>
                </ContextMenu.Content>
              </ContextMenu.Portal>
            </ContextMenu.Root>
          ))}
        </div>
      ) : null}
    </div>
  )
}
