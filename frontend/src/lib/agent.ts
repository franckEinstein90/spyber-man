export interface StoredCrawl {
  url: string
  title: string
  excerpt: string
  screenshotFile: string | null
  error: string | null
  timestamp: string
}

export type ToolState = "running" | "done" | "error"

export type MessagePart =
  | { type: "text"; text: string }
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
        error: "Timed out waiting for this page.",
        timestamp: new Date().toISOString(),
      },
  )
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

function summarizeCaptures(items: StoredCrawl[]): string {
  return items
    .map((item) => {
      if (item.error) return `${item.url} did not capture. ${item.error}`
      const title = item.title || "The page"
      if (item.screenshotFile) return `${title} is below, with the screenshot.`
      return `${title} came back without a screenshot.`
    })
    .join(" ")
}

export async function instructAgent(
  instruction: string,
  publish: (parts: MessagePart[]) => void,
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
  const stopService = asksToStopService(instruction)
  const startService = asksToStartService(instruction)

  try {
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

    if (urls.length === 0 && wantsSummary) {
      addText("I'll ask the MCP server to summarize that text.")
      const result = asRecord(await runTool("summarize_text", "supplied text", { text: instruction }))
      if (typeof result.error === "string") {
        addText(result.error)
        return
      }
      addText(typeof result.summary === "string" ? result.summary : "The summary tool returned no text.")
      return
    }

    if (urls.length === 0) {
      addText(
        "I can start the web crawler, stop it, or tell you if it is running. I can also crawl pages, for example: crawl https://example.com and show the screenshot.",
      )
      return
    }

    const health = asRecord(await runTool("get_crawler_status", "backend process", {}))
    if (health.running !== true) {
      addText("The web crawler is stopped, so I'll start it before opening those pages.")
      const startedService = asRecord(await runTool("start_crawler", "backend process", {}))
      if (startedService.running !== true) {
        addText(errorText(startedService.error ?? startedService))
        return
      }
    }

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

    if (wantsSummary) {
      const source = items
        .map((item) => [item.title, item.excerpt].filter(Boolean).join("\n"))
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
    addText(error instanceof Error ? error.message : String(error))
  }
}
