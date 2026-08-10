import { defineConfig, devices } from '@playwright/test';

// E2E config — localhost only for now. Set PLAYWRIGHT_BASE_URL to override.
// Preview-URL runs and CI wiring land in Phase H.
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

// When E2E_PROD_SERVER is set, run the tests against a production build
// (`next start`) instead of the dev server (`next dev`). CI sets this after a
// `next build` step. Prod mode eliminates the dev-only `useContext` SSR race
// (see the retries note below) and exercises the actual shipping bundle.
const USE_PROD_SERVER = !!process.env.E2E_PROD_SERVER;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // DB state is shared; keep sequential until we partition.
  workers: 1,
  // CI runs against a production build (E2E_PROD_SERVER) which avoids the Next.js
  // 14.2 dev-server SSR race — a spurious "Cannot read properties of null
  // (reading 'useContext')" 500 on client components under load, a known
  // dev-only issue absent from production builds. Retries remain to absorb
  // residual timing flakes (e.g. realtime, shared-DB races) in either mode.
  // Deterministic failures still fail all tries.
  retries: 2,
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
        // Prod build in CI (`next start`, requires a prior `next build`);
        // dev server for local iteration.
        command: USE_PROD_SERVER ? 'npm run start' : 'npm run dev',
        url: BASE_URL,
        // Never reuse a stale server in CI; reuse locally for fast iteration.
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
