import { expect, requireRole, signIn, test } from '../fixtures';

/**
 * The office surface, signed in.
 *
 * These need a reachable Supabase project with a seeded OWNER. Point them at a
 * disposable staging project — the suite writes rows — and never at anything
 * holding real customer data:
 *
 *   E2E_BASE_URL=https://staging.example.com \
 *   E2E_OWNER_EMAIL=… E2E_OWNER_PASSWORD=… pnpm test:e2e
 *
 * Without that configuration they skip rather than pass, so a green run never
 * means "the workflow works" when nothing was actually exercised.
 */

test.describe('office, signed in', () => {
  requireRole('owner');
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'owner');
  });

  test('the dashboard opens and shows the shell', async ({ page }) => {
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('navigation').first()).toBeVisible();
  });

  test('every main section opens without an error boundary', async ({ page }) => {
    const sections = [
      '/dashboard/kunden',
      '/dashboard/objekte',
      '/dashboard/mitarbeiter',
      '/dashboard/planung',
      '/dashboard/planung/plaene',
      '/dashboard/auftraege',
      '/dashboard/arbeitszeiten',
      '/dashboard/leistungsnachweise',
      '/dashboard/checklisten',
      '/dashboard/reklamationen',
      '/dashboard/qualitaetskontrolle',
      '/dashboard/abrechnung',
      '/dashboard/vertrieb/anfragen',
      '/dashboard/vertrieb/besichtigungen',
      '/dashboard/vertrieb/angebote',
      '/dashboard/urlaub-krankheit',
      '/dashboard/nachrichten',
      '/dashboard/settings',
    ];
    for (const path of sections) {
      const response = await page.goto(path);
      expect(response?.status(), `${path} returned ${response?.status()}`).toBeLessThan(500);
      await expect(page.locator('body'), `${path} rendered an error boundary`).not.toContainText(
        /Application error|Unhandled Runtime Error/,
      );
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    }
  });

  test('a customer can be created and is listed afterwards', async ({ page }) => {
    const name = `E2E Hausverwaltung ${Date.now()}`;
    await page.goto('/dashboard/kunden/neu');
    await page.locator('input[name=name]').fill(name);
    await page.getByRole('button', { name: /kunde anlegen/i }).click();

    await page.waitForURL(/\/dashboard\/kunden/, { timeout: 30_000 });
    await page.goto('/dashboard/kunden');
    await expect(page.getByText(name).first()).toBeVisible();
  });

  test('an issued invoice offers no line editor', async ({ page }) => {
    await page.goto('/dashboard/abrechnung?status=ISSUED');
    const firstInvoice = page.locator('a[href*="/dashboard/abrechnung/"]').first();
    test.skip((await firstInvoice.count()) === 0, 'no issued invoice in this environment');

    await firstInvoice.click();
    await page.waitForURL(/\/dashboard\/abrechnung\/[0-9a-f-]{36}/);
    await expect(page.getByRole('button', { name: /position hinzufügen/i })).toHaveCount(0);
  });

  test('the office surface is usable on a phone', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'checked in the mobile project only');
    await page.goto('/dashboard');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `dashboard overflows by ${overflow}px`).toBeLessThanOrEqual(0);
    await expect(page.getByRole('button', { name: /menü/i })).toBeVisible();
  });
});
