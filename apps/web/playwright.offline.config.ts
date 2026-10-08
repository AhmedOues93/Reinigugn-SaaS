import { defineConfig, devices } from '@playwright/test';

/**
 * Der Browserlauf fuer die Warteschlange auf dem Geraet.
 *
 * Eigene Konfiguration, weil diese Suite als einzige *keinen* Server braucht:
 * sie prueft IndexedDB und die Wiedervorlage, nicht das Rendern. Mit der
 * gewoehnlichen Konfiguration wuerde Playwright erst die ganze Anwendung bauen
 * -- eine Minute Wartezeit fuer eine Seite, die absichtlich leer ist.
 *
 * Gelaufen wird auf einem Telefonformat: die Mitarbeiter-App wird einhaendig
 * auf einem Telefon benutzt, und die Warteschlange gehoert ihr.
 */
export default defineConfig({
  testDir: './e2e/offline',
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    // Siehe e2e/offline/harness/page.ts: die Seiten werden mit `route`
    // ausgeliefert, es wird nichts gesendet.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : undefined,
    trace: 'retain-on-failure',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
  },
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'] } }],
});
