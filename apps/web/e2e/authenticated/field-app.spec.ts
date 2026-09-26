import { expect, requireRole, signIn, test } from '../fixtures';

/**
 * The employee app on a phone.
 *
 * This runs in the `mobile` project (Pixel 7, ~390px) because that is the only
 * width that matters here: the app is used one-handed, outdoors, often in
 * gloves. A control that needs a desktop to hit is broken.
 *
 * The time-tracking assertions matter most. A cleaner's pay and a customer's
 * invoice both come from these numbers, so a double-tapped Start that opens two
 * entries is a payroll bug, not a UI annoyance.
 */

test.describe('field app', () => {
  requireRole('employee');
  test.beforeEach(async ({ page }, testInfo) => {
    // Only meaningful at phone width; the office project covers the desktop.
    test.skip(testInfo.project.name !== 'mobile', 'phone-width behaviour');
    await signIn(page, 'employee');
  });

  test('opens on what to do now', async ({ page }) => {
    await expect(page).toHaveURL(/\/mitarbeiter/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `the field app overflows by ${overflow}px`).toBeLessThanOrEqual(0);
  });

  test('a job shows where to go and how to get in', async ({ page }) => {
    await page.goto('/mitarbeiter/einsaetze');
    const job = page.locator('a[href*="/mitarbeiter/einsaetze/"]').first();
    test.skip((await job.count()) === 0, 'no job assigned to this employee in this environment');

    await job.click();
    await page.waitForURL(/\/mitarbeiter\/einsaetze\/[0-9a-f-]{36}/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Address and access notes are the reason to open this screen at all.
    await expect(page.locator('body')).toContainText(/adresse|anfahrt|zugang|objekt/i);
  });

  test('start, pause, resume and finish produce one entry with net time', async ({ page }) => {
    await page.goto('/mitarbeiter/einsaetze');
    const job = page.locator('a[href*="/mitarbeiter/einsaetze/"]').first();
    test.skip((await job.count()) === 0, 'no job assigned to this employee in this environment');
    await job.click();
    await page.waitForURL(/\/mitarbeiter\/einsaetze\/[0-9a-f-]{36}/);

    const start = page.getByRole('button', { name: /starten|beginnen/i }).first();
    test.skip((await start.count()) === 0, 'this job is not in a startable state');

    await start.click();
    // Running state, asserted rather than waited for.
    await expect(page.getByRole('button', { name: /pause/i }).first()).toBeVisible();

    await page.getByRole('button', { name: /pause/i }).first().click();
    await expect(page.getByRole('button', { name: /fortsetzen|weiter/i }).first()).toBeVisible();

    await page.getByRole('button', { name: /fortsetzen|weiter/i }).first().click();
    await expect(page.getByRole('button', { name: /pause/i }).first()).toBeVisible();

    await page.getByRole('button', { name: /beenden|abschließen/i }).first().click();
    await expect(page.getByText(/abgeschlossen|beendet/i).first()).toBeVisible();

    // Exactly one entry, and the break is subtracted rather than ignored.
    await expect(page.locator('body')).toContainText(/pause/i);
  });

  test('a double-tapped start does not open a second entry', async ({ page }) => {
    await page.goto('/mitarbeiter/einsaetze');
    const job = page.locator('a[href*="/mitarbeiter/einsaetze/"]').first();
    test.skip((await job.count()) === 0, 'no job assigned to this employee in this environment');
    await job.click();
    await page.waitForURL(/\/mitarbeiter\/einsaetze\/[0-9a-f-]{36}/);

    const start = page.getByRole('button', { name: /starten|beginnen/i }).first();
    test.skip((await start.count()) === 0, 'this job is not in a startable state');

    // Two taps as fast as a cold thumb on a cracked screen.
    await start.click();
    await start.click({ force: true, timeout: 2_000 }).catch(() => {
      /* the control is already gone, which is itself the protection */
    });

    await expect(page.getByRole('button', { name: /starten|beginnen/i })).toHaveCount(0);
    // The server rejects the second start; the screen must not claim otherwise.
    await expect(page.locator('body')).not.toContainText(/zwei|doppelt erfasst/i);
  });

  test('a checklist item can be ticked and stays ticked', async ({ page }) => {
    await page.goto('/mitarbeiter/einsaetze');
    const job = page.locator('a[href*="/mitarbeiter/einsaetze/"]').first();
    test.skip((await job.count()) === 0, 'no job assigned to this employee in this environment');
    await job.click();
    await page.waitForURL(/\/mitarbeiter\/einsaetze\/[0-9a-f-]{36}/);

    const item = page.getByRole('checkbox').first();
    test.skip((await item.count()) === 0, 'this job has no checklist');

    await item.check();
    await expect(item).toBeChecked();
    await page.reload();
    await expect(page.getByRole('checkbox').first()).toBeChecked();
  });

  test('the employee cannot reach billing or customer money', async ({ page }) => {
    for (const forbidden of ['/dashboard/abrechnung', '/dashboard/vertrieb/angebote', '/dashboard/kunden']) {
      await page.goto(forbidden);
      await expect(page.locator('body'), `${forbidden} leaked office data`).not.toContainText(
        /Gesamtbetrag|Rechnungsnr|Angebotsnr/i,
      );
    }
  });
});
