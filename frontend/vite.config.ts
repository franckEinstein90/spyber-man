import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { mcpBridgePlugin } from './server/mcpBridge.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '')
  const backendPort = env.BACKEND_PORT || '3000'
  const frontendPort = Number(env.FRONTEND_PORT || '5173')

  return {
    envDir: repoRoot,
    plugins: [react(), tailwindcss(), mcpBridgePlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: frontendPort,
      proxy: {
        '/api': `http://localhost:${backendPort}`,
        '/screengrabs': `http://localhost:${backendPort}`,
      },
    },
  }
})
