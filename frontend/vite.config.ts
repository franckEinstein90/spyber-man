import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { mcpBridgePlugin } from './server/mcpBridge.ts'

export default defineConfig({
  plugins: [react(), tailwindcss(), mcpBridgePlugin()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/screengrabs': 'http://localhost:3000',
    },
  },
})
