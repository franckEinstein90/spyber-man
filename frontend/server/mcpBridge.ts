import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import type { IncomingMessage, ServerResponse } from "node:http"
import path from "node:path"
import type { Plugin } from "vite"

const mcpDir = path.resolve(import.meta.dirname, "../../mcp")

type ToolResult = {
  content?: Array<{ type: string; text?: string }>
  isError?: boolean
  structuredContent?: unknown
}

let clientPromise: Promise<Client> | null = null

function connectClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const transport = new StdioClientTransport({
        command: "uv",
        args: ["run", "server.py"],
        cwd: mcpDir,
      })
      const client = new Client({ name: "spyber-frontend", version: "0.1.0" })
      await client.connect(transport)
      return client
    })().catch((error: unknown) => {
      clientPromise = null
      throw error
    })
  }
  return clientPromise
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk)
    })
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"))
    })
    req.on("error", reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader("Content-Type", "application/json")
  res.end(JSON.stringify(body))
}

function payloadFromResult(result: ToolResult): unknown {
  const text = (result.content ?? [])
    .filter((item) => item.type === "text")
    .map((item) => item.text ?? "")
    .join("\n")
    .trim()

  if (result.isError) {
    throw new Error(text || "MCP tool failed")
  }

  if (text) {
    try {
      return JSON.parse(text) as unknown
    } catch {
      return { text }
    }
  }

  if (result.structuredContent !== undefined) {
    return result.structuredContent
  }

  return {}
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = req.url?.split("?")[0]
  if (url !== "/mcp/tools" && url !== "/mcp/call") {
    return false
  }

  try {
    const client = await connectClient()

    if (url === "/mcp/tools" && req.method === "GET") {
      const listed = await client.listTools()
      sendJson(res, 200, {
        tools: listed.tools.map((tool) => ({
          name: tool.name,
          description: tool.description ?? "",
        })),
      })
      return true
    }

    if (url === "/mcp/call" && req.method === "POST") {
      const raw = await readBody(req)
      const body = JSON.parse(raw) as { name?: string; arguments?: Record<string, unknown> }
      if (!body.name) {
        sendJson(res, 400, { error: "Tool name is required" })
        return true
      }
      // Cohere Parse plus embeddings can run for several minutes.
      const timeout = body.name === "parse_screenshot" ? 540_000 : 60_000
      const result = (await client.callTool(
        {
          name: body.name,
          arguments: body.arguments ?? {},
        },
        undefined,
        { timeout },
      )) as ToolResult
      sendJson(res, 200, { result: payloadFromResult(result) })
      return true
    }

    sendJson(res, 405, { error: "Method not allowed" })
    return true
  } catch (error) {
    clientPromise = null
    const message = error instanceof Error ? error.message : String(error)
    sendJson(res, 500, { error: message })
    return true
  }
}

export function mcpBridgePlugin(): Plugin {
  const middleware = (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
    void handle(req, res)
      .then((handled) => {
        if (!handled) next()
      })
      .catch(next)
  }

  return {
    name: "spyber-mcp-bridge",
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
