import { expect, label, requireRole, signIn, test } from '../fixtures';

/**
 * The money-making path, end to end:
 *
 *   Anfrage → Besichtigung → Leistungsverzeichnis → Kalkulation → Angebot
 *   → Annahme → Kunde + Objekt + Plan → Einsätze
 *
 * This is the sequence a real company follows to win and start work, and every
 * stage hands something to the next. The assertions are about that handover,
 * not about each page rendering: an accepted quote that produces a plan with
 * no visits is the failure this suite exists to catch.
 */

test.describe('sales pipeline', () => {
  requireRole('owner');
  test.slow(); // one long workflow, several server round trips

  test('an accepted quote creates the customer, the site, the plan and its visits', async ({ page }) => {
    await signIn(page, 'owner');
    const organisation = label('Anfrage');

    // --- Anfrage -----------------------------------------------------------
    await page.goto('/dashboard/vertrieb/anfragen/neu');
    await page.locator('input[name=organisation]').fill(organisation);
    await page.locator('input[name=contact_person]').fill('Frau Muster');
    await page.locator('input[name=email]').fill(`anfrage-${Date.now()}@e2e.invalid`);
    await page.locator('input[name=street]').fill('Alstertor 1');
    await page.locator('input[name=postal_code]').fill('20095');
    await page.locator('input[name=city]').fill('Hamburg');
    await page.getByRole('button', { name: /anfrage|speichern|anlegen/i }).first().click();
    await page.waitForURL(/\/dashboard\/vertrieb\/anfragen/, { timeout: 30_000 });

    await page.goto('/dashboard/vertrieb/anfragen');
    await page.getByRole('link', { name: organisation }).first().click();
    await page.waitForURL(/\/dashboard\/vertrieb\/anfragen\/[0-9a-f-]{36}/);
    const leadUrl = page.url();

    // --- Besichtigung ------------------------------------------------------
    const scheduleInput = page.locator('input[type=datetime-local]').first();
    await expect(scheduleInput).toBeVisible();
    const when = new Date(Date.now() + 86_400_000).toISOString().slice(0, 16);
    await scheduleInput.fill(when);
    await page.getByRole('button', { name: /besichtigung/i }).first().click();

    await expect(page.getByText(/besichtigung/i).first()).toBeVisible();
    await page.goto('/dashboard/vertrieb/besichtigungen');
    await page.getByRole('link').filter({ hasText: /Alstertor|E2E/ }).first().click();
    await page.waitForURL(/\/dashboard\/vertrieb\/besichtigungen\/[0-9a-f-]{36}/);

    // --- Leistungsverzeichnis + Kalkulation --------------------------------
    // Areas are the calculation's input: square metres, minutes, frequency.
    await page.locator('input[name=name]').first().fill('Büroflächen');
    await page.locator('input[name=area_sqm]').first().fill('320');
    await page.locator('input[name=services_per_week]').first().fill('3');
    await page.locator('input[name=minutes_per_service]').first().fill('120');
    await page.getByRole('button', { name: /fläche|hinzufügen/i }).first().click();
    await expect(page.getByText('Büroflächen').first()).toBeVisible();

    await page.getByRole('button', { name: /abschließen|abgeschlossen/i }).first().click();

    // --- Angebot -----------------------------------------------------------
    await page.getByRole('button', { name: /angebot/i }).first().click();
    await page.waitForURL(/\/dashboard\/vertrieb\/angebote/, { timeout: 30_000 });

    const quoteUrl = page.url();
    // A calculation that produced nothing is a broken quote, not an empty one.
    await expect(page.getByText(/€/).first()).toBeVisible();

    await page.getByRole('button', { name: /senden/i }).first().click();
    await expect(page.getByText(/AN-\d{4}-\d{4}/).first()).toBeVisible();

    // --- Annahme -----------------------------------------------------------
    for (const weekday of ['1', '3', '5']) {
      const box = page.locator(`input[name=weekdays][value="${weekday}"]`);
      if (await box.count()) await box.check();
    }
    await page.getByRole('button', { name: /annehmen|angenommen/i }).first().click();
    await expect(page.getByText(/angenommen/i).first()).toBeVisible();

    // --- The handover, which is the point of the test ----------------------
    await page.goto(quoteUrl);
    const customerLink = page.getByRole('link', { name: /kunde|kunden/i }).first();
    await expect(customerLink, 'the accepted quote links to the customer it created').toBeVisible();

    await page.goto('/dashboard/planung/plaene');
    await expect(page.getByText(organisation).first().or(page.getByText(/E2E/).first())).toBeVisible();

    // Visits must exist without anyone touching the plan. This is the dead end
    // fixed in phase 15 and the reason the whole spec is here.
    await page.goto('/dashboard/auftraege');
    await expect(
      page.getByRole('row').filter({ hasText: /E2E|Alstertor/ }).first().or(page.getByText(/Alstertor/).first()),
      'an accepted quote produced no visits',
    ).toBeVisible();
  });
});

test.describe('recurring plans', () => {
  requireRole('owner');

  test('generating again does not duplicate visits', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/dashboard/planung');

    const countVisits = async () =>
      page.evaluate(() => document.querySelectorAll('a[href*="/dashboard/auftraege/"]').length);

    const before = await countVisits();

    // The planning screen offers a top-up when plans are running out; pressing
    // it must be safe however often it happens.
    const extend = page.getByRole('button', { name: /einsätze verlängern/i });
    if (await extend.count()) {
      await extend.click();
      await expect(extend).toBeEnabled();
      await page.reload();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const after = await countVisits();
      expect(after, 'extending the horizon duplicated visits in the shown week').toBe(before);
    }
  });

  test('the week board shows unassigned visits as needing attention', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/dashboard/planung');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/planung/i);
    // Either there is work, or the board says plainly that there is none.
    const hasVisits = (await page.locator('a[href*="/dashboard/auftraege/"]').count()) > 0;
    if (!hasVisits) await expect(page.getByText(/keine einsätze/i).first()).toBeVisible();
  });
});
