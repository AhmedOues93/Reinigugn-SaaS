import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration.
 *
 * Two ways to run:
 *
 *   pnpm test:e2e                    builds the app and serves it on 3100
 *   E2E_BASE_URL=… pnpm test:e2e     runs against an already-running app,
 *                                    local or a deployed staging URL
 *
 * The specs are split by what they need. `e2e/public` exercises everything
 * reachable without signing in and runs anywhere, including CI with no
 * backend. `e2e/authenticated` needs a real Supabase project and a seeded
 * owner; those specs skip themselves, loudly, when it is not configured rather
 * than passing vacuously.
 *
 * The dummy Supabase values below exist so the server can boot for the public
 * specs. They are not credentials and reach nothing: any request made with
 * them fails, which is exactly what the public specs expect.
 */
const externalTarget = process.env.E2E_BASE_URL;
const port = 3100;

export default defineConfig({
  testDir: './e2e',
  // A workflow assertion that needs a retry is usually telling the truth.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: externalTarget ?? `http://127.0.0.1:${port}`,
    // Normally Playwright uses the browsers it installed. Sandboxes and locked
    // down CI images sometimes ship a Chromium of a different build number, so
    // this lets the runner point at the one it actually has without the config
    // carrying a machine-specific path.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
  },

  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    // The employee app is used one-handed on a phone; 390px is the real target.
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],

  // Only manage a server when we were not pointed at one.
  webServer: externalTarget
    ? undefined
    : {
        command: `pnpm exec next build && pnpm exec next start -p ${port}`,
        port,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
        env: {
          NEXT_PUBLIC_APP_ENV: 'local',
          NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
            process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'e2e-placeholder-not-a-credential',
          NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${port}`,
        },
      },
});
