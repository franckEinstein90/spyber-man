import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '');
  const backendPort = env.BACKEND_PORT || env.PORT || '3000';
  const callbackPort = env.CALLBACK_PORT || '8000';
  const frontendPort = Number(env.FRONTEND_PORT || '5173');

  return {
    envDir: repoRoot,
    plugins: [react()],
    server: {
      port: frontendPort,
      proxy: {
        '/backend': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/backend/, ''),
        },
        '/callback': {
          target: `http://localhost:${callbackPort}`,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/callback/, ''),
        },
      },
    },
  };
});
