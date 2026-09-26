import { useEffect, useRef, useState } from "react"
import { ArrowUp, LoaderCircle, PanelLeft, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  initialServiceSnapshots,
  loadServiceSnapshots,
  type ServiceHealth,
  type ServiceSnapshot,
} from "@/lib/services"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { instructAgent, type MessagePart } from "@/lib/agent"

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

function MessageParts({ parts }: { parts: MessagePart[] }) {
  return (
    <div className="flex flex-col gap-3">
      {parts.map((part, index) => {
        if (part.type === "text") {
          return (
            <p key={index} className="text-sm leading-6 whitespace-pre-wrap">
              {part.text}
            </p>
          )
        }

        if (part.type === "tool") {
          return (
            <div
              key={index}
              className="flex items-start gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm"
            >
              {part.state === "running" ? (
                <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin" />
              ) : (
                <Badge variant={part.state === "error" ? "destructive" : "secondary"}>
                  {part.state === "error" ? "Failed" : "Done"}
                </Badge>
              )}
              <div className="min-w-0">
                <div className="font-medium">{part.name}</div>
                <div className="text-muted-foreground whitespace-pre-wrap">{part.detail}</div>
              </div>
            </div>
          )
        }

        return (
          <div key={index} className="flex flex-col gap-3">
            {part.items.map((item) => (
              <Card key={item.url} size="sm">
                {item.screenshotFile ? (
                  <img
                    src={screenshotSrc(item.screenshotFile)}
                    alt={item.title || item.url}
                    className="max-h-96 w-full object-cover object-top"
                  />
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
                      <CardContent className="max-h-80 overflow-auto whitespace-pre-wrap text-sm">
                        {item.parsedMarkdown}
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
  const bottomRef = useRef<HTMLDivElement>(null)

  const active =
    conversations.find((conversation) => conversation.id === activeId) ?? conversations[0]

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations))
  }, [conversations])

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0")
  }, [collapsed])

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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [active.messages, busy])

  function updateConversation(id: string, recipe: (conversation: Conversation) => Conversation) {
    setConversations((current) => current.map((conversation) => (conversation.id === id ? recipe(conversation) : conversation)))
  }

  async function send(text: string) {
    const instruction = text.trim()
    if (!instruction || busy) return

    const conversationId = active.id
    const assistantId = crypto.randomUUID()
    const title = active.messages.length === 0 ? instruction.slice(0, 42) : active.title

    updateConversation(conversationId, (conversation) => ({
      ...conversation,
      title,
      updatedAt: Date.now(),
      messages: [
        ...conversation.messages,
        { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: instruction }] },
        { id: assistantId, role: "assistant", parts: [] },
      ],
    }))
    setDraft("")
    setBusy(true)

    try {
      await instructAgent(instruction, (parts) => {
        updateConversation(conversationId, (conversation) => ({
          ...conversation,
          updatedAt: Date.now(),
          messages: conversation.messages.map((message) =>
            message.id === assistantId ? { ...message, parts } : message,
          ),
        }))
      })
    } finally {
      setBusy(false)
    }
  }

  function startNewChat() {
    const next = blankConversation()
    setConversations((current) => [next, ...current])
    setActiveId(next.id)
    setDraft("")
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
              <div className="text-xs text-muted-foreground">MCP crawl agent</div>
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
        <header className="border-b px-6 py-3">
          <div className="text-sm font-medium">Instruct Spyber</div>
          <p className="text-xs text-muted-foreground">
            Ask Spyber to crawl a page, then parse the screenshot if you want markdown.
          </p>
        </header>

        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-6">
            {active.messages.length === 0 ? (
              <div className="flex flex-col gap-3 pt-16">
                <h1 className="text-2xl font-medium tracking-tight">What should I open?</h1>
                <p className="max-w-xl text-sm text-muted-foreground">
                  Ask whether the web crawler or the database is running, or tell Spyber to start or stop
                  either one. You can check for pending migrations and apply them, or send a URL
                  and the screenshot comes back in this thread. Ask Spyber to parse it when you want markdown.
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
                <div
                  key={message.id}
                  className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
                >
                  <div
                    className={
                      message.role === "user"
                        ? "max-w-[85%] rounded-2xl bg-primary px-4 py-2 text-primary-foreground"
                        : "w-full max-w-[85%]"
                    }
                  >
                    {message.role === "assistant" ? (
                      <div className="mb-2 text-xs font-medium text-muted-foreground">Spyber</div>
                    ) : null}
                    {message.parts.length === 0 ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <LoaderCircle className="size-4 animate-spin" />
                        Reading the instruction
                      </div>
                    ) : (
                      <MessageParts parts={message.parts} />
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        <form
          className="border-t px-6 py-4"
          onSubmit={(event) => {
            event.preventDefault()
            void send(draft)
          }}
        >
          <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  void send(draft)
                }
              }}
              placeholder="Crawl https://example.com and show the screenshot"
              rows={2}
              disabled={busy}
              className="min-h-16 resize-none"
            />
            <Button type="submit" size="icon" disabled={busy || draft.trim().length === 0} aria-label="Send">
              {busy ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
            </Button>
          </div>
        </form>
      </main>
    </div>
  )
}
