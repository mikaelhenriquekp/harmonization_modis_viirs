import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, './src') },
    },
    server: {
      // In dev, /api is proxied to the backend so the app is same-origin like in prod.
      proxy: {
        '/api': env.VITE_API_PROXY_TARGET ?? 'http://localhost:8080',
      },
    },
  }
})
