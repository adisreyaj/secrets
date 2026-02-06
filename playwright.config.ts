import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './apps/web/e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    storageState: './apps/web/e2e/.auth/storage.json',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  globalSetup: './apps/web/e2e/global-setup.ts',
  webServer: [
    {
      command: 'DOTENV_CONFIG_PATH=apps/server/.env.test pnpm -C apps/server dev',
      url: 'http://localhost:3001/health',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'VITE_API_URL=http://localhost:3001 pnpm -C apps/web dev --port 5173',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
})
