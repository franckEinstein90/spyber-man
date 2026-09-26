export type ServiceHealth = "running" | "stopped" | "unknown"

export interface ServiceSnapshot {
  id: string
  label: string
  health: ServiceHealth
}

interface MonitoredService {
  id: string
  label: string
  check: () => Promise<boolean>
}

async function readTool(name: string): Promise<Record<string, unknown>> {
  const response = await fetch("/mcp/call", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, arguments: {} }),
  })
  const body = (await response.json()) as { result?: unknown }
  if (!response.ok || !body.result || typeof body.result !== "object") {
    throw new Error(`Unable to read ${name}`)
  }
  return body.result as Record<string, unknown>
}

// Add an entry when another local service should show in the rail.
const monitoredServices: MonitoredService[] = [
  {
    id: "webcrawler",
    label: "Web crawler",
    check: async () => {
      const result = await readTool("get_crawler_status")
      return result.running === true
    },
  },
  {
    id: "database",
    label: "Database",
    check: async () => {
      const result = await readTool("get_database_status")
      return result.running === true
    },
  },
]

export function initialServiceSnapshots(): ServiceSnapshot[] {
  return monitoredServices.map((service) => ({
    id: service.id,
    label: service.label,
    health: "unknown",
  }))
}

export async function loadServiceSnapshots(): Promise<ServiceSnapshot[]> {
  return Promise.all(
    monitoredServices.map(async (service) => {
      try {
        const running = await service.check()
        return {
          id: service.id,
          label: service.label,
          health: running ? "running" : "stopped",
        } satisfies ServiceSnapshot
      } catch {
        return { id: service.id, label: service.label, health: "unknown" }
      }
    }),
  )
}
