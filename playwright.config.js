import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'fs'

// In development environments where the browser can't be downloaded,
// fall back to the pre-installed system Chromium at a known path.
const SYSTEM_CHROMIUM = '/opt/pw-browsers/chromium'
const executablePath = existsSync(SYSTEM_CHROMIUM) ? SYSTEM_CHROMIUM : undefined

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        launchOptions: {
          ...(executablePath ? { executablePath } : {}),
          args: ['--no-sandbox', '--disable-dev-shm-usage'],
        },
      },
    },
  ],
  webServer: {
    command: 'VITE_BASE=/ npm run build && npm run preview -- --port 4173 --base /',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  snapshotPathTemplate: 'tests/__snapshots__/{arg}{ext}',
})
