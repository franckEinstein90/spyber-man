import { useEffect, useRef, useState } from "react"
import { ArrowLeft, ArrowUp, ImageIcon, Images, Paperclip, PanelLeft, Plus, Settings, X } from "lucide-react"
import { DropdownMenu } from "radix-ui"
import { cn } from "@/lib/utils"
import {
  initialServiceSnapshots,
  loadServiceSnapshots,
  type ServiceHealth,
  type ServiceSnapshot,
} from "@/lib/services"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChatContainerContent,
  ChatContainerRoot,
  ChatContainerScrollAnchor,
} from "@/components/ui/chat-container"
import { Loader } from "@/components/ui/loader"
import { Markdown } from "@/components/ui/markdown"
import { Message, MessageAvatar, MessageContent } from "@/components/ui/message"
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/ui/prompt-input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ScrollButton } from "@/components/ui/scroll-button"
import { Separator } from "@/components/ui/separator"
import { Source, SourceContent, SourceTrigger } from "@/components/ui/source"
import { Tool, type ToolPart } from "@/components/ui/tool"
import { SettingsPage } from "@/components/SettingsPage"
import { instructAgent, parseStoredScreenshot, type ConversationTurn, type MessagePart, type PixelCrop, type StoredCrawl, type ToolState } from "@/lib/agent"
import { ScreenshotCropDialog } from "@/components/ScreenshotCropDialog"
import { ImagesPage, type GalleryImage } from "@/components/ImagesPage"
import { applyThemeMode, readThemeMode, saveThemeMode, type ThemeMode } from "@/lib/theme"
import {
  attachmentContext,
  formatBytes,
  hasReadableText,
  isImageFile,
  MAX_ATTACHMENTS,
  readStoredAttachment,
  type DraftAttachment,
} from "@/lib/attachments"

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  parts: MessagePart[]
}

interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  updatedAt: number
}

const STORAGE_KEY = "spyber-chats-v1"
const SIDEBAR_KEY = "spyber-sidebar-collapsed"

function healthLabel(health: ServiceHealth): string {
  if (health === "running") return "Running"
  if (health === "stopped") return "Stopped"
  return "Unknown"
}

function healthDotClass(health: ServiceHealth): string {
  if (health === "running") return "bg-emerald-500"
  if (health === "stopped") return "bg-rose-400"
  return "bg-amber-400"
}

const SUGGESTIONS = [
  "Is the web crawler running?",
  "Are any database migrations pending?",
  "Crawl https://example.com and show me the screenshot.",
  "Parse the latest screenshot.",
  "Show the logs.",
  "What do the stored pages say?",
]

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return [blankConversation()]
    const parsed = JSON.parse(raw) as Conversation[]
    if (!Array.isArray(parsed) || parsed.length === 0) return [blankConversation()]
    return parsed
  } catch {
    return [blankConversation()]
  }
}

function blankConversation(): Conversation {
  return {
    id: crypto.randomUUID(),
    title: "New chat",
    messages: [],
    updatedAt: Date.now(),
  }
}

function screenshotSrc(file: string): string {
  return `/screengrabs/${encodeURIComponent(file)}`
}

function sourceUrls(text: string): string[] | null {
  const match = text.match(/^From\s+(.+)$/s)
  if (!match) return null
  const urls = match[1]
    .split(",")
    .map((item) => item.trim())
    .filter((item) => /^https?:\/\//.test(item))
  return urls.length > 0 ? urls : null
}

function toolPartState(state: ToolState): ToolPart["state"] {
  if (state === "running") return "input-streaming"
  if (state === "error") return "output-error"
  return "output-available"
}

function MessageParts({
  parts,
  messageId,
  onOpenScreenshot,
}: {
  parts: MessagePart[]
  messageId: string
  onOpenScreenshot: (item: StoredCrawl) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      {parts.map((part, index) => {
        if (part.type === "text") {
          const urls = sourceUrls(part.text)
          if (urls) {
            return (
              <div key={index} className="flex flex-wrap gap-2">
                {urls.map((url) => (
                  <Source key={url} href={url}>
                    <SourceTrigger showFavicon label={new URL(url).hostname.replace(/^www\./, "")} />
                    <SourceContent title={url} description="Stored page used for this answer" />
                  </Source>
                ))}
              </div>
            )
          }
          return (
            <MessageContent key={index} markdown id={`${messageId}-${index}`}>
              {part.text}
            </MessageContent>
          )
        }

        if (part.type === "attachments") {
          return (
            <div key={index} className="flex flex-wrap gap-2">
              {part.items.map((item, itemIndex) => (
                <div
                  key={`${item.name}-${itemIndex}`}
                  className="bg-secondary flex max-w-full items-center gap-2 rounded-2xl border px-2 py-1.5 text-sm"
                >
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" className="size-10 rounded-lg object-cover" />
                  ) : (
                    <Paperclip className="text-muted-foreground size-4 shrink-0" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate">{item.name}</span>
                    <span className="text-muted-foreground block text-xs">{formatBytes(item.size)}</span>
                  </span>
                </div>
              ))}
            </div>
          )
        }

        if (part.type === "tool") {
          return (
            <Tool
              key={index}
              defaultOpen={part.state !== "done"}
              toolPart={{
                type: part.name,
                state: toolPartState(part.state),
                input: { detail: part.detail },
                errorText: part.state === "error" ? part.detail : undefined,
              }}
            />
          )
        }

        return (
          <div key={index} className="flex flex-col gap-3">
            {part.items.map((item) => (
              <Card key={item.url} size="sm" className={item.screenshotFile ? "pt-0" : undefined}>
                {item.screenshotFile ? (
                  <button
                    type="button"
                    className="block w-full cursor-zoom-in text-left"
                    onDoubleClick={() => onOpenScreenshot(item)}
                  >
                    <img
                      src={screenshotSrc(item.screenshotFile)}
                      alt={item.title || item.url}
                      className="max-h-96 w-full rounded-t-xl object-cover object-top"
                    />
                    <span className="text-muted-foreground block px-4 pt-2 text-xs">
                      Double-click to view the whole image, crop it, and parse that region.
                    </span>
                  </button>
                ) : null}
                <CardHeader>
                  <CardTitle>{item.title || "Untitled page"}</CardTitle>
                  <CardDescription>{item.url}</CardDescription>
                </CardHeader>
                {item.error ? (
                  <CardContent className="text-destructive">{item.error}</CardContent>
                ) : (
                  <>
                    {item.excerpt ? (
                      <CardContent className="text-muted-foreground">{item.excerpt}</CardContent>
                    ) : null}
                    {item.parsedMarkdown ? (
                      <CardContent className="max-h-80 overflow-auto">
                        <Markdown id={`${messageId}-parsed-${item.url}`} className="prose prose-sm dark:prose-invert max-w-none">
                          {item.parsedMarkdown}
                        </Markdown>
                      </CardContent>
                    ) : null}
                  </>
                )}
              </Card>
            ))}
          </div>
        )
      })}
    </div>
  )
}

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations)
  const [activeId, setActiveId] = useState("")
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === "1")
  const [services, setServices] = useState<ServiceSnapshot[]>(initialServiceSnapshots)
  const [view, setView] = useState<"chat" | "settings" | "images">("chat")
  const [themeMode, setThemeMode] = useState<ThemeMode>(readThemeMode)
  const [attachments, setAttachments] = useState<DraftAttachment[]>([])
  const [cropTarget, setCropTarget] = useState<StoredCrawl | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const active =
    conversations.find((conversation) => conversation.id === activeId) ?? conversations[0]

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations))
  }, [conversations])

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0")
  }, [collapsed])

  useEffect(() => {
    applyThemeMode(themeMode)
    if (themeMode !== "system") return
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => applyThemeMode("system")
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [themeMode])

  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      void loadServiceSnapshots().then((next) => {
        if (!cancelled) setServices(next)
      })
    }
    refresh()
    const timer = window.setInterval(refresh, 4000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  function updateConversation(id: string, recipe: (conversation: Conversation) => Conversation) {
    setConversations((current) => current.map((conversation) => (conversation.id === id ? recipe(conversation) : conversation)))
  }

  function releaseAttachments(items: DraftAttachment[]) {
    for (const item of items) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
    }
  }

  function addDraftFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    const next: DraftAttachment[] = []
    for (const file of list) {
      next.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: isImageFile(file) ? URL.createObjectURL(file) : undefined,
      })
    }
    setAttachments((current) => [...current, ...next].slice(0, MAX_ATTACHMENTS))
  }

  function removeDraftFile(id: string) {
    setAttachments((current) => {
      const target = current.find((item) => item.id === id)
      if (target) releaseAttachments([target])
      return current.filter((item) => item.id !== id)
    })
  }

  function historyFrom(messages: ChatMessage[]): ConversationTurn[] {
    return messages.flatMap((message) => {
      const typed = message.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n")
        .trim()
      const attached = message.parts
        .filter((part) => part.type === "attachments")
        .flatMap((part) => part.items)
      const files = attachmentContext(attached).slice(0, 6000)
      const text = [typed, files].filter(Boolean).join("\n\n").trim()
      if (!text) return []
      return [{ role: message.role, text }]
    })
  }

  async function send(text: string) {
    const typed = text.trim()
    if (busy || (!typed && attachments.length === 0)) return

    const draftFiles = attachments
    const stored = await Promise.all(draftFiles.map((item) => readStoredAttachment(item.file)))
    releaseAttachments(draftFiles)
    setAttachments([])
    setDraft("")

    const conversationId = active.id
    const history = historyFrom(active.messages)
    const assistantId = crypto.randomUUID()
    const titleSource = typed || stored.map((item) => item.name).join(", ")
    const title = active.messages.length === 0 ? titleSource.slice(0, 42) : active.title
    const userParts: MessagePart[] = []
    if (stored.length > 0) userParts.push({ type: "attachments", items: stored })
    if (typed) userParts.push({ type: "text", text: typed })
    const filesOnly = !typed && !hasReadableText(stored)
    const assistantParts: MessagePart[] = filesOnly
      ? [
          {
            type: "text",
            text: "I added those files. I can read text files such as notes, markdown, CSV, and JSON. Ask a question about one of those.",
          },
        ]
      : []

    updateConversation(conversationId, (conversation) => ({
      ...conversation,
      title,
      updatedAt: Date.now(),
      messages: [
        ...conversation.messages,
        { id: crypto.randomUUID(), role: "user", parts: userParts },
        { id: assistantId, role: "assistant", parts: assistantParts },
      ],
    }))

    if (filesOnly) return

    setBusy(true)

    try {
      await instructAgent(
        typed || "Answer using the attached files.",
        (parts) => {
          updateConversation(conversationId, (conversation) => ({
            ...conversation,
            updatedAt: Date.now(),
            messages: conversation.messages.map((message) =>
              message.id === assistantId ? { ...message, parts } : message,
            ),
          }))
        },
        history,
        attachmentContext(stored),
      )
    } finally {
      setBusy(false)
    }
  }

  async function parseCrop(target: StoredCrawl, crop: PixelCrop) {
    if (busy) return
    setView("chat")
    const conversationId = active.id
    const assistantId = crypto.randomUUID()
    const rounded = {
      x: Math.round(crop.x),
      y: Math.round(crop.y),
      width: Math.round(crop.width),
      height: Math.round(crop.height),
    }
    const title = active.messages.length === 0 ? `Parse ${target.url}`.slice(0, 42) : active.title

    updateConversation(conversationId, (conversation) => ({
      ...conversation,
      title,
      updatedAt: Date.now(),
      messages: [
        ...conversation.messages,
        {
          id: crypto.randomUUID(),
          role: "user",
          parts: [
            {
              type: "text",
              text: `Parse the selected region (${rounded.width} × ${rounded.height} px) of ${target.url}.`,
            },
          ],
        },
        { id: assistantId, role: "assistant", parts: [] },
      ],
    }))
    setBusy(true)
    try {
      await parseStoredScreenshot(
        (parts) => {
          updateConversation(conversationId, (conversation) => ({
            ...conversation,
            updatedAt: Date.now(),
            messages: conversation.messages.map((message) =>
              message.id === assistantId ? { ...message, parts } : message,
            ),
          }))
        },
        { url: target.url || undefined, crop: rounded, screenshotFile: target.screenshotFile },
      )
    } finally {
      setBusy(false)
    }
  }

  function openGalleryImage(image: GalleryImage) {
    setCropTarget({
      url: image.url ?? "",
      title: image.url ?? image.filename,
      excerpt: "",
      screenshotFile: image.filename,
      parsedMarkdown: null,
      error: null,
      timestamp: image.visitedAt ?? new Date().toISOString(),
    })
  }

  function startNewChat() {
    const next = blankConversation()
    setConversations((current) => [next, ...current])
    setActiveId(next.id)
    setDraft("")
    setAttachments((current) => {
      releaseAttachments(current)
      return []
    })
  }

  return (
    <div className="flex h-full bg-background text-foreground">
      <aside
        className={cn(
          "flex shrink-0 flex-col overflow-hidden border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200",
          collapsed ? "w-14" : "w-64",
        )}
      >
        <div className={cn("flex items-center gap-2 py-3", collapsed ? "flex-col px-2" : "justify-between px-3")}>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => setCollapsed((open) => !open)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <PanelLeft />
          </Button>
          {collapsed ? null : (
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Spyber</div>
              <div className="text-xs text-muted-foreground">Answers from stored pages</div>
            </div>
          )}
          <Button type="button" size="icon" variant="outline" onClick={startNewChat} aria-label="New chat">
            <Plus />
          </Button>
        </div>
        <Separator />
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-1 p-2">
            {collapsed
              ? null
              : conversations.map((conversation) => (
                  <Button
                    key={conversation.id}
                    type="button"
                    variant={conversation.id === active.id ? "secondary" : "ghost"}
                    className="h-auto justify-start px-2 py-2 text-left whitespace-normal"
                    onClick={() => setActiveId(conversation.id)}
                  >
                    <span className="line-clamp-2">{conversation.title}</span>
                  </Button>
                ))}
          </div>
        </ScrollArea>
        <Separator />
        <div className={cn("flex flex-col gap-2 py-3", collapsed ? "items-center px-2" : "px-3")}>
          {collapsed ? null : (
            <div className="text-xs font-medium text-muted-foreground">Services</div>
          )}
          {services.map((service) => (
            <div
              key={service.id}
              className={cn("flex items-center gap-2", collapsed ? "justify-center" : "min-w-0")}
              title={`${service.label}: ${healthLabel(service.health)}`}
            >
              <span
                className={cn("size-2 shrink-0 rounded-full", healthDotClass(service.health))}
                role="status"
                aria-label={`${service.label} is ${healthLabel(service.health).toLowerCase()}`}
              />
              {collapsed ? null : (
                <div className="min-w-0">
                  <div className="truncate text-sm">{service.label}</div>
                  <div className="text-xs text-muted-foreground">{healthLabel(service.health)}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b px-6 py-3">
          {view === "chat" ? (
            <div>
              <div className="text-sm font-medium">Instruct Spyber</div>
              <p className="text-xs text-muted-foreground">
                Ask about pages already stored, or crawl and parse a new one.
              </p>
            </div>
          ) : (
            <Button type="button" variant="ghost" onClick={() => setView("chat")}>
              <ArrowLeft />
              Back to chat
            </Button>
          )}
          {view === "chat" ? (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Images"
                onClick={() => setView("images")}
              >
                <Images />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Settings"
                onClick={() => setView("settings")}
              >
                <Settings />
              </Button>
            </div>
          ) : null}
        </header>

        {view === "settings" ? (
          <div className="min-h-0 flex-1 overflow-auto">
            <SettingsPage
              mode={themeMode}
              onModeChange={(mode) => {
                setThemeMode(mode)
                saveThemeMode(mode)
              }}
            />
          </div>
        ) : null}
        {view === "images" ? (
          <div className="min-h-0 flex-1 overflow-auto">
            <ImagesPage
              onOpen={openGalleryImage}
              onDeleted={(filename) => {
                setCropTarget((current) => (current?.screenshotFile === filename ? null : current))
              }}
            />
          </div>
        ) : null}
        <ChatContainerRoot className={cn("relative min-h-0 flex-1", view !== "chat" && "hidden")}>
          <ChatContainerContent className="mx-auto w-full max-w-3xl gap-6 px-6 py-6">
            {active.messages.length === 0 ? (
              <div className="flex flex-col gap-3 pt-16">
                <h1 className="text-2xl font-medium tracking-tight">What do you want to know?</h1>
                <p className="max-w-xl text-sm text-muted-foreground">
                  Ask about pages that have been parsed. Spyber answers from those stored chunks and keeps
                  the thread in mind. You can also crawl a URL, parse the screenshot, and check the crawler,
                  the database, and the logs.
                </p>
                <div className="mt-4 flex flex-col items-start gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <Button
                      key={suggestion}
                      type="button"
                      variant="outline"
                      className="h-auto justify-start py-2 text-left whitespace-normal"
                      disabled={busy}
                      onClick={() => void send(suggestion)}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              active.messages.map((message) => (
                <Message
                  key={message.id}
                  className={message.role === "user" ? "flex-row-reverse" : undefined}
                >
                  {message.role === "assistant" ? (
                    <MessageAvatar src="" alt="Spyber" fallback="S" />
                  ) : null}
                  <div
                    className={cn(
                      "flex min-w-0 flex-col gap-2",
                      message.role === "user" ? "max-w-[85%] items-end" : "max-w-[90%] flex-1",
                    )}
                  >
                    {message.parts.length === 0 ? (
                      <Loader variant="text-shimmer" text="Reading the instruction" />
                    ) : (
                      <MessageParts
                        parts={message.parts}
                        messageId={message.id}
                        onOpenScreenshot={setCropTarget}
                      />
                    )}
                  </div>
                </Message>
              ))
            )}
            <ChatContainerScrollAnchor />
          </ChatContainerContent>
          <div className="absolute right-4 bottom-4">
            <ScrollButton />
          </div>
        </ChatContainerRoot>

        <div className={cn("border-t px-6 py-4", view !== "chat" && "hidden")}>
          <PromptInput
            className="mx-auto w-full max-w-3xl"
            value={draft}
            onValueChange={setDraft}
            onSubmit={() => void send(draft)}
            isLoading={busy}
            disabled={busy}
          >
            {attachments.length > 0 ? (
              <div className="flex flex-wrap gap-2 px-2 pt-1">
                {attachments.map((item) => (
                  <div
                    key={item.id}
                    className="bg-muted flex max-w-full items-center gap-2 rounded-2xl border py-1 pr-1 pl-2 text-sm"
                  >
                    {item.previewUrl ? (
                      <img src={item.previewUrl} alt="" className="size-8 rounded-lg object-cover" />
                    ) : (
                      <Paperclip className="text-muted-foreground size-4 shrink-0" />
                    )}
                    <span className="max-w-40 truncate">{item.file.name}</span>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Remove ${item.file.name}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        removeDraftFile(item.id)
                      }}
                    >
                      <X />
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
            <PromptInputTextarea placeholder="Ask about a stored page, or crawl https://example.com" />
            <PromptInputActions className="justify-between px-2 pb-2">
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="rounded-full"
                    aria-label="Add files"
                    disabled={busy}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Plus />
                  </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    side="top"
                    align="start"
                    sideOffset={8}
                    className="bg-popover text-popover-foreground z-50 min-w-44 rounded-xl border p-1 shadow-md"
                  >
                    <DropdownMenu.Item
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm outline-none data-[highlighted]:bg-muted"
                      onSelect={() => {
                        window.setTimeout(() => imageInputRef.current?.click(), 0)
                      }}
                    >
                      <ImageIcon className="size-4" />
                      Add images
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm outline-none data-[highlighted]:bg-muted"
                      onSelect={() => {
                        window.setTimeout(() => fileInputRef.current?.click(), 0)
                      }}
                    >
                      <Paperclip className="size-4" />
                      Add files
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                  addDraftFiles(event.target.files)
                  event.target.value = ""
                }}
              />
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                  addDraftFiles(event.target.files)
                  event.target.value = ""
                }}
              />
              <PromptInputAction tooltip="Send">
                <Button
                  type="button"
                  size="icon"
                  disabled={busy || (draft.trim().length === 0 && attachments.length === 0)}
                  aria-label="Send"
                  onClick={() => void send(draft)}
                >
                  {busy ? <Loader variant="circular" size="sm" /> : <ArrowUp />}
                </Button>
              </PromptInputAction>
            </PromptInputActions>
          </PromptInput>
        </div>
        {cropTarget?.screenshotFile ? (
          <ScreenshotCropDialog
            src={screenshotSrc(cropTarget.screenshotFile)}
            title={cropTarget.title || cropTarget.url}
            open
            onClose={() => setCropTarget(null)}
            onParse={(crop: PixelCrop) => {
              const target = cropTarget
              setCropTarget(null)
              void parseCrop(target, crop)
            }}
          />
        ) : null}
      </main>
    </div>
  )
}
