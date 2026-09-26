export interface StoredCrawl {
  url: string
  title: string
  excerpt: string
  screenshotFile: string | null
  parsedMarkdown?: string | null
  error: string | null
  timestamp: string
}

export type ToolState = "running" | "done" | "error"

export interface PixelCrop {
  x: number
  y: number
  width: number
  height: number
}

export interface ChatAttachment {
  name: string
  mediaType: string
  size: number
  text?: string
  truncated?: boolean
  imageUrl?: string
}

export type MessagePart =
  | { type: "text"; text: string }
  | { type: "attachments"; items: ChatAttachment[] }
  | { type: "tool"; name: string; detail: string; state: ToolState }
  | { type: "captures"; items: StoredCrawl[] }

const CALLBACK_URL = "http://localhost:3000/api/crawl-results"

export function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"']+/g) ?? []
  const cleaned = matches.map((url) => url.replace(/[),.;]+$/g, ""))
  return [...new Set(cleaned)]
}

async function callMcp(name: string, args: Record<string, unknown>): Promise<unknown> {
  let response: Response
  try {
    response = await fetch("/mcp/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, arguments: args }),
    })
  } catch {
    throw new Error("The chat could not reach the MCP bridge. Restart the frontend dev server.")
  }

  const body = (await response.json()) as { result?: unknown; error?: string }
  if (!response.ok) {
    throw new Error(body.error || `MCP tool ${name} failed (${response.status})`)
  }
  return body.result
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

function errorText(value: unknown): string {
  if (typeof value === "string") return value
  const record = asRecord(value)
  if (typeof record.error === "string") return record.error
  if (record.error) return errorText(record.error)
  return "The MCP tool returned an error."
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

async function waitForCrawls(urls: string[], since: number): Promise<StoredCrawl[]> {
  const deadline = Date.now() + 120_000
  const found = new Map<string, StoredCrawl>()

  while (found.size < urls.length && Date.now() < deadline) {
    const result = asRecord(await callMcp("get_crawl_results", { limit: 50 }))
    if (typeof result.error === "string") {
      throw new Error(result.error)
    }
    const items = Array.isArray(result.items) ? (result.items as StoredCrawl[]) : []
    for (const item of items) {
      if (!urls.includes(item.url) || found.has(item.url)) continue
      if (Date.parse(item.timestamp) < since - 5_000) continue
      found.set(item.url, item)
    }
    if (found.size < urls.length) {
      await sleep(1000)
    }
  }

  return urls.map(
    (url) =>
      found.get(url) ?? {
        url,
        title: "",
        excerpt: "",
        screenshotFile: null,
        parsedMarkdown: null,
        error: "Timed out waiting for this page.",
        timestamp: new Date().toISOString(),
      },
  )
}

function mentionsDatabase(text: string): boolean {
  return /\b(database|postgres|postgresql)\b/i.test(text)
}

function asksToStopDatabase(text: string): boolean {
  return mentionsDatabase(text)
    && /\b(stop|shut\s*down|shutdown|kill|turn\s+off|switch\s+off)\b/i.test(text)
}

function asksToStartDatabase(text: string): boolean {
  return mentionsDatabase(text)
    && /\b(start|launch|boot|turn\s+on|switch\s+on|bring\s+up|spin\s+up)\b/i.test(text)
}

function asksForDatabaseStatus(text: string): boolean {
  if (!mentionsDatabase(text)) return false
  const aboutState = /\b(status|running|alive|reachable|health|up|down|stopped)\b/i.test(text)
  const runningQuestion = /\b(is|are)\b[\s\S]{0,48}\b(running|up|down|alive|stopped)\b/i.test(text)
  return aboutState || runningQuestion
}

function asksToApplyMigrations(text: string): boolean {
  return (/\b(apply|run|execute)\b/i.test(text) && /\bmigrations?\b/i.test(text))
    || /\bmigrate\b/i.test(text)
}

function asksToCheckMigrations(text: string): boolean {
  if (!/\bmigrations?\b/i.test(text)) return false
  return /\b(pending|needed|need|missing|status|check|any|unapplied|outstanding|applied)\b/i.test(text)
}

function databaseAddress(result: Record<string, unknown>): string {
  const host = typeof result.host === "string" ? result.host : "127.0.0.1"
  const port = typeof result.port === "number" ? result.port : 5432
  return `${host}:${port}`
}

function fileList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function describeMigrations(result: Record<string, unknown>, appliedNow = false): string {
  if (result.ok === false) return errorText(result.error ?? result)
  const pending = fileList(result.pending)
  const executed = fileList(result.executed)
  const applied = fileList(result.applied)
  const where = result.running === true
    ? "The database is running."
    : "The database is stopped, so this was read from the data files."
  if (appliedNow) {
    if (executed.length === 0) return `${where} There were no pending migrations.`
    const target = result.running === true ? "on the running database" : "to the data files"
    return `Applied ${executed.join(", ")} ${target}.`
  }
  if (pending.length === 0) {
    return `${where} No migrations are pending. ${applied.length} already applied.`
  }
  return `${where} ${pending.length} migration${pending.length === 1 ? "" : "s"} still need to be applied: ${pending.join(", ")}.`
}

function asksForLogs(text: string): boolean {
  return /\b(logs?|observability)\b/i.test(text)
    || /\b(what went wrong|recent errors|show errors)\b/i.test(text)
    || (/\bwhy did\b/i.test(text) && /\b(fail|failed|error|timeout|timed out|crash|parse|crawl)\b/i.test(text))
}

function explainToolFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes("-32001") || /request timed out/i.test(message)) {
    return "That request timed out before the crawler finished. Parsing a full-page screenshot can take several minutes. Say \"show the logs\" to see how far it got."
  }
  return message
}

function asksToParse(text: string): boolean {
  return /\b(parse|parsed|parsing|cohere)\b/i.test(text)
}

function asksToOpenPage(text: string): boolean {
  return /\b(crawl|open|visit|browse|fetch|scrape|navigate)\b/i.test(text)
}

function asksToStopService(text: string): boolean {
  return /\b(stop|shut\s*down|shutdown|kill|turn\s+off|switch\s+off)\b/i.test(text)
    && /\b(web\s*crawler|webcrawler|crawler|backend)\b/i.test(text)
}

function asksToStartService(text: string): boolean {
  return /\b(start|launch|boot|turn\s+on|switch\s+on|bring\s+up|spin\s+up)\b/i.test(text)
    && /\b(web\s*crawler|webcrawler|crawler|backend)\b/i.test(text)
}

function asksForStatus(text: string): boolean {
  const aboutService = /\b(web\s*crawler|webcrawler|crawler|backend|server)\b/i.test(text)
  const aboutState = /\b(status|running|alive|reachable|health|up|down|stopped)\b/i.test(text)
  const runningQuestion = /\b(is|are)\b[\s\S]{0,48}\b(running|up|down|alive|stopped)\b/i.test(text)
  return (aboutService && aboutState) || runningQuestion
}

function serviceUrl(result: Record<string, unknown>): string {
  return typeof result.backend_url === "string" ? result.backend_url : "http://localhost:3000"
}

function describeStatus(result: Record<string, unknown>): string {
  const url = serviceUrl(result)
  if (result.running === true) {
    const count = result.recent_result_count
    const stored = typeof count === "number" ? ` ${count} recent result${count === 1 ? "" : "s"} are stored.` : ""
    return `Yes. The web crawler is running at ${url}.${stored}`
  }
  return "No. The web crawler is not running."
}

function asStoredCrawl(value: Record<string, unknown>): StoredCrawl | null {
  if (typeof value.url !== "string") return null
  return {
    url: value.url,
    title: typeof value.title === "string" ? value.title : "",
    excerpt: typeof value.excerpt === "string" ? value.excerpt : "",
    screenshotFile: typeof value.screenshotFile === "string" ? value.screenshotFile : null,
    parsedMarkdown: typeof value.parsedMarkdown === "string" ? value.parsedMarkdown : null,
    error: typeof value.error === "string" ? value.error : null,
    timestamp: typeof value.timestamp === "string" ? value.timestamp : new Date().toISOString(),
  }
}

function summarizeCaptures(items: StoredCrawl[]): string {
  return items
    .map((item) => {
      if (item.error) return `${item.url} did not capture. ${item.error}`
      const title = item.title || "The page"
      if (item.parsedMarkdown) return `${title} is below, with the screenshot and the parsed page.`
      if (item.screenshotFile) return `${title} is below, with the screenshot.`
      return `${title} came back without a screenshot.`
    })
    .join(" ")
}

export interface ConversationTurn {
  role: "user" | "assistant"
  text: string
}

export async function parseStoredScreenshot(
  publish: (parts: MessagePart[]) => void,
  options: { url?: string; crop?: PixelCrop; screenshotFile?: string | null } = {},
): Promise<void> {
  const parts: MessagePart[] = []
  const show = () => publish(structuredClone(parts))
  const addText = (text: string) => {
    parts.push({ type: "text", text })
    show()
  }
  const runTool = async (name: string, detail: string, args: Record<string, unknown>) => {
    parts.push({ type: "tool", name, detail, state: "running" })
    const index = parts.length - 1
    show()
    try {
      const result = await callMcp(name, args)
      const tool = parts[index]
      if (tool?.type === "tool") tool.state = "done"
      show()
      return result
    } catch (error) {
      const tool = parts[index]
      if (tool?.type === "tool") tool.state = "error"
      show()
      throw error
    }
  }

  try {
    const health = asRecord(await runTool("get_crawler_status", "backend process", {}))
    if (health.running !== true) {
      addText("The web crawler is stopped, so I'll start it first.")
      const startedService = asRecord(await runTool("start_crawler", "backend process", {}))
      if (startedService.running !== true) {
        addText(errorText(startedService.error ?? startedService))
        return
      }
    }

    const crop = options.crop
    const detail = crop
      ? `${Math.round(crop.width)} × ${Math.round(crop.height)} px`
      : options.url ?? "latest screenshot"
    addText(crop ? `I'll parse the selected region of ${options.url ?? "the latest screenshot"}.` : "I'll parse the latest screenshot.")
    const args: Record<string, unknown> = {}
    if (options.url) args.url = options.url
    if (crop) {
      args.crop_x = Math.round(crop.x)
      args.crop_y = Math.round(crop.y)
      args.crop_width = Math.round(crop.width)
      args.crop_height = Math.round(crop.height)
    }
    if (options.screenshotFile) args.screenshot_file = options.screenshotFile
    const result = asRecord(await runTool("parse_screenshot", detail, args))
    if (typeof result.error === "string") {
      addText(result.error)
      return
    }
    const item = asStoredCrawl(result)
    if (!item) {
      addText("Parse finished without a screenshot to show.")
      return
    }
    addText("The parsed page is below, next to the screenshot.")
    parts.push({ type: "captures", items: [item] })
    show()
    const count = typeof result.ragChunks === "number" ? result.ragChunks : 0
    if (typeof result.ragError === "string" && result.ragError) {
      addText(result.ragError)
    } else if (count > 0) {
      addText(`Stored ${count} chunk${count === 1 ? "" : "s"} from ${item.url} with embeddings.`)
    }
  } catch (error) {
    for (const part of parts) {
      if (part.type === "tool" && part.state === "running") part.state = "error"
    }
    addText(explainToolFailure(error))
  }
}

export async function instructAgent(
  instruction: string,
  publish: (parts: MessagePart[]) => void,
  history: ConversationTurn[] = [],
  attachmentText = "",
): Promise<void> {
  const parts: MessagePart[] = []
  const show = () => publish(structuredClone(parts))

  const addText = (text: string) => {
    parts.push({ type: "text", text })
    show()
  }

  const runTool = async (name: string, detail: string, args: Record<string, unknown>) => {
    parts.push({ type: "tool", name, detail, state: "running" })
    const index = parts.length - 1
    show()
    try {
      const result = await callMcp(name, args)
      const tool = parts[index]
      if (tool?.type === "tool") tool.state = "done"
      show()
      return result
    } catch (error) {
      const tool = parts[index]
      if (tool?.type === "tool") tool.state = "error"
      show()
      throw error
    }
  }

  const urls = extractUrls(instruction)
  const wantsSummary = /\bsummar/i.test(instruction)
  const wantsParse = asksToParse(instruction)
  const wantsCrawl = urls.length > 0 && (!wantsParse || asksToOpenPage(instruction))
  const stopService = asksToStopService(instruction)
  const startService = asksToStartService(instruction)

  const ensureCrawler = async (): Promise<boolean> => {
    const health = asRecord(await runTool("get_crawler_status", "backend process", {}))
    if (health.running === true) return true
    addText("The web crawler is stopped, so I'll start it first.")
    const startedService = asRecord(await runTool("start_crawler", "backend process", {}))
    if (startedService.running === true) return true
    addText(errorText(startedService.error ?? startedService))
    return false
  }

  const parseCaptures = async (targets: string[]): Promise<void> => {
    const parsed: StoredCrawl[] = []
    const notes: string[] = []
    const labels = targets.length > 0 ? targets : [undefined]
    for (const target of labels) {
      const detail = target ?? "latest screenshot"
      const args = target ? { url: target } : {}
      const result = asRecord(await runTool("parse_screenshot", detail, args))
      if (typeof result.error === "string") {
        addText(result.error)
        continue
      }
      const item = asStoredCrawl(result)
      if (!item) {
        addText("Parse finished without a screenshot to show.")
        continue
      }
      parsed.push(item)
      const count = typeof result.ragChunks === "number" ? result.ragChunks : 0
      if (typeof result.ragError === "string" && result.ragError) {
        notes.push(result.ragError)
      } else if (count > 0) {
        notes.push(
          `Stored ${count} chunk${count === 1 ? "" : "s"} from ${item.url} with embeddings.`,
        )
      }
    }
    if (parsed.length === 0) return
    addText(
      parsed.length === 1
        ? "The parsed page is below, next to the screenshot."
        : "The parsed pages are below, next to each screenshot.",
    )
    parts.push({ type: "captures", items: parsed })
    show()
    if (notes.length > 0) addText(notes.join(" "))
  }

  try {
    if (asksToApplyMigrations(instruction)) {
      addText("I'll apply pending database migrations.")
      const result = asRecord(await runTool("apply_migrations", "sql migrations", {}))
      addText(describeMigrations(result, true))
      return
    }

    if (asksToCheckMigrations(instruction)) {
      addText("I'll check for database migrations that have not been applied.")
      const result = asRecord(await runTool("get_migration_status", "sql migrations", {}))
      addText(describeMigrations(result))
      return
    }

    if (asksToStopDatabase(instruction)) {
      addText("I'll stop the database.")
      const result = asRecord(await runTool("stop_database", "embedded postgres", {}))
      if (result.already_stopped === true) {
        addText("The database was already stopped.")
      } else if (result.running === false) {
        addText("The database is stopped.")
      } else {
        addText(errorText(result.error ?? result))
      }
      return
    }

    if (urls.length === 0 && asksToStartDatabase(instruction)) {
      addText("I'll start the database.")
      const result = asRecord(await runTool("start_database", "embedded postgres", {}))
      if (result.running === true && result.already_running === true) {
        addText(`The database is already running on ${databaseAddress(result)}.`)
      } else if (result.running === true) {
        addText(`The database is running on ${databaseAddress(result)}.`)
      } else {
        addText(errorText(result.error ?? result))
      }
      return
    }

    if (urls.length === 0 && asksForDatabaseStatus(instruction)) {
      addText("I'll check whether the database is running.")
      const result = asRecord(await runTool("get_database_status", "embedded postgres", {}))
      if (result.running === true) {
        addText(`Yes. The database is running on ${databaseAddress(result)}.`)
      } else {
        addText(`No. The database is not running on ${databaseAddress(result)}.`)
      }
      return
    }

    if (stopService) {
      addText("I'll stop the web crawler.")
      const result = asRecord(await runTool("stop_crawler", "backend process", {}))
      if (result.already_stopped === true) {
        addText("The web crawler was already stopped.")
      } else if (result.running === false) {
        addText("The web crawler is stopped.")
      } else {
        addText(errorText(result.error ?? result))
      }
      return
    }

    if (urls.length === 0 && startService) {
      addText("I'll start the web crawler.")
      const result = asRecord(await runTool("start_crawler", "backend process", {}))
      if (result.running === true && result.already_running === true) {
        addText(`The web crawler is already running at ${serviceUrl(result)}.`)
      } else if (result.running === true) {
        addText(`The web crawler is running at ${serviceUrl(result)}.`)
      } else {
        addText(errorText(result.error ?? result))
      }
      return
    }

    if (urls.length === 0 && asksForStatus(instruction)) {
      addText("I'll check whether the web crawler is running.")
      const result = asRecord(await runTool("get_crawler_status", "backend process", {}))
      addText(describeStatus(result))
      return
    }

    if (asksForLogs(instruction)) {
      addText("I'll read the recent crawler logs.")
      const result = asRecord(await runTool("get_app_logs", "app_logs", { limit: 20 }))
      if (typeof result.error === "string") {
        addText(result.error)
        return
      }
      const items = Array.isArray(result.items) ? result.items : []
      if (items.length === 0) {
        addText("No log entries are stored yet.")
        return
      }
      const lines = items.slice(0, 20).map((item) => {
        const row = asRecord(item)
        const when = typeof row.logged_at === "string" ? row.logged_at.replace("T", " ").slice(0, 19) : ""
        const level = typeof row.level === "string" ? row.level : "info"
        const event = typeof row.event === "string" ? row.event : "event"
        const message = typeof row.message === "string" ? row.message : ""
        const duration = typeof row.duration_ms === "number" ? ` (${Math.round(row.duration_ms / 1000)}s)` : ""
        return `${when} ${level} ${event}${duration}: ${message}`
      })
      addText(lines.join("\n"))
      return
    }

    if (wantsParse && !wantsCrawl) {
      addText(
        urls.length === 1
          ? `I'll parse the screenshot from ${urls[0]}.`
          : "I'll parse the latest screenshot.",
      )
      if (!(await ensureCrawler())) return
      await parseCaptures(urls)
      return
    }

    if (urls.length === 0) {
      addText("I'll look through the stored pages.")
      if (!(await ensureCrawler())) return
      const result = asRecord(
        await runTool("ask_knowledge", "stored pages", {
          question: instruction,
          history_json: JSON.stringify(history.slice(-6)),
          attachment_text: attachmentText,
        }),
      )
      if (typeof result.error === "string") {
        addText(result.error)
        return
      }
      const answer = typeof result.answer === "string" ? result.answer : "I could not answer from the stored pages."
      addText(answer)
      const sources = Array.isArray(result.sources)
        ? result.sources.filter((item): item is string => typeof item === "string")
        : []
      if (sources.length > 0) {
        addText(`From ${sources.join(", ")}`)
      }
      return
    }

    if (!(await ensureCrawler())) return

    addText(
      urls.length === 1
        ? `I'll use the MCP server to open ${urls[0]} and bring the screenshot back here.`
        : `I'll use the MCP server to crawl these ${urls.length} pages, then attach each screenshot here.`,
    )

    const since = Date.now()
    const started = asRecord(
      await runTool("start_crawl", urls.join("\n"), {
        urls,
        callback_url: CALLBACK_URL,
      }),
    )
    if (started.accepted === false) {
      const startTool = parts.at(-1)
      if (startTool?.type === "tool") startTool.state = "error"
      show()
      addText(errorText(started.error ?? started))
      return
    }

    parts.push({ type: "tool", name: "get_crawl_results", detail: "waiting for pages", state: "running" })
    const pollIndex = parts.length - 1
    show()
    const items = await waitForCrawls(urls, since)
    const poll = parts[pollIndex]
    if (poll?.type === "tool") {
      poll.state = items.every((item) => item.error) ? "error" : "done"
    }
    show()

    addText(summarizeCaptures(items))
    parts.push({ type: "captures", items })
    show()

    if (wantsParse) {
      const ready = items.filter((item) => item.screenshotFile && !item.error).map((item) => item.url)
      if (ready.length === 0) {
        addText("There is no screenshot to parse.")
      } else {
        addText(ready.length === 1 ? "I'll parse that screenshot next." : "I'll parse those screenshots next.")
        await parseCaptures(ready)
      }
    } else if (items.some((item) => item.screenshotFile && !item.error)) {
      addText('Say "parse the screenshot" if you want that image turned into markdown.')
    }

    if (wantsSummary) {
      const source = items
        .map((item) => [item.title, item.parsedMarkdown || item.excerpt].filter(Boolean).join("\n"))
        .filter(Boolean)
        .join("\n\n")
      if (!source) {
        addText("There was no page text to summarize.")
        return
      }
      const result = asRecord(await runTool("summarize_text", "captured page text", { text: source }))
      addText(typeof result.summary === "string" ? result.summary : errorText(result.error ?? result))
    }
  } catch (error) {
    for (const part of parts) {
      if (part.type === "tool" && part.state === "running") part.state = "error"
    }
    addText(explainToolFailure(error))
  }
}
