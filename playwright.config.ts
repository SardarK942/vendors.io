import { defineConfig, devices } from '@playwright/test';

// E2E config — localhost only for now. Set PLAYWRIGHT_BASE_URL to override.
// Preview-URL runs and CI wiring land in Phase H.
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // DB state is shared; keep sequential until we partition.
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // If Next dev server isn't already running, spin one up. Skips reuse if caller
  // already has `npm run dev` in another terminal (cheaper for iteration).
  webServer: process.env.PLAYWRIGHT_SKIP_WEB_SERVER
    ? undefined
    : {
        command: 'npm run dev',
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
