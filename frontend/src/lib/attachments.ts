export interface StoredAttachment {
  name: string
  mediaType: string
  size: number
  text?: string
  truncated?: boolean
  imageUrl?: string
}

export interface DraftAttachment {
  id: string
  file: File
  previewUrl?: string
}

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "csv",
  "json",
  "html",
  "xml",
  "log",
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
  "css",
  "yml",
  "yaml",
])

const MAX_TEXT_CHARS = 20_000
const MAX_IMAGE_BYTES = 400_000
export const MAX_ATTACHMENTS = 8

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/")
}

export function isTextFile(file: File): boolean {
  if (file.type.startsWith("text/")) return true
  if (
    file.type === "application/json" ||
    file.type === "application/xml" ||
    file.type === "application/javascript"
  ) {
    return true
  }
  const extension = file.name.split(".").pop()?.toLowerCase() ?? ""
  return TEXT_EXTENSIONS.has(extension)
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "")
    reader.onerror = () => reject(reader.error ?? new Error("Could not read that file."))
    reader.readAsDataURL(file)
  })
}

export async function readStoredAttachment(file: File): Promise<StoredAttachment> {
  const stored: StoredAttachment = {
    name: file.name,
    mediaType: file.type || "application/octet-stream",
    size: file.size,
  }

  if (isImageFile(file)) {
    if (file.size <= MAX_IMAGE_BYTES) {
      stored.imageUrl = await readDataUrl(file)
    }
    return stored
  }

  if (isTextFile(file)) {
    const raw = await file.text()
    stored.truncated = raw.length > MAX_TEXT_CHARS
    stored.text = stored.truncated ? raw.slice(0, MAX_TEXT_CHARS) : raw
  }

  return stored
}

export function attachmentContext(items: StoredAttachment[]): string {
  return items
    .map((item) => {
      if (item.text?.trim()) {
        const note = item.truncated ? "\n[File truncated]" : ""
        return `${item.name}\n${item.text}${note}`
      }
      return `${item.name} (${item.mediaType}, ${formatBytes(item.size)})`
    })
    .join("\n\n")
}

export function hasReadableText(items: StoredAttachment[]): boolean {
  return items.some((item) => Boolean(item.text?.trim()))
}
