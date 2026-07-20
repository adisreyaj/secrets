import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'

function devServerOptions() {
  const port = process.env.PORT ? Number(process.env.PORT) : undefined
  const host = process.env.HOST?.trim() || undefined

  return {
    ...(host ? { host } : {}),
    ...(port ? { port, strictPort: true } : {}),
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: devServerOptions(),
})
