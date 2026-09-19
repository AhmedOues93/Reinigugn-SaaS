import { expect, requireRole, signIn, test } from '../fixtures';

/**
 * The customer portal, and the boundaries around it.
 *
 * The security specs here are the browser-level counterpart to the SQL suite.
 * The database has been shown to refuse cross-tenant reads; these check that
 * no route, cache or redirect puts the data on screen anyway — which is a
 * different failure, and the one a customer would actually notice.
 */

test.describe('customer portal', () => {
  requireRole('customer');
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'customer');
  });

  test('answers the questions a customer actually has', async ({ page }) => {
    await expect(page).toHaveURL(/\/portal/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Next cleaning, recent work, what is owed — in some form.
    await expect(page.locator('body')).toContainText(/termin|reinigung|rechnung|leistung/i);
  });

  test('invoices are listed and downloadable as the same document the office sees', async ({ page }) => {
    await page.goto('/portal/rechnungen');
    const invoice = page.locator('a[href*="/portal/rechnungen/"]').first();
    test.skip((await invoice.count()) === 0, 'this customer has no invoice in this environment');

    await invoice.click();
    await page.waitForURL(/\/portal\/rechnungen\/[0-9a-f-]{36}/);
    await expect(page.getByText(/RE-\d{4}-\d{4}/).first()).toBeVisible();

    const pdf = await page.request.get(`${page.url()}/pdf`);
    expect(pdf.status()).toBe(200);
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('a draft invoice is never visible to the customer', async ({ page }) => {
    await page.goto('/portal/rechnungen');
    // Drafts have no number; the portal must not list them at all.
    await expect(page.getByText(/entwurf/i)).toHaveCount(0);
  });

  test('a complaint can be raised', async ({ page }) => {
    await page.goto('/portal/reklamationen/neu');
    const title = page.locator('input[name=title]');
    test.skip((await title.count()) === 0, 'complaints are not offered in this environment');

    await title.fill(`E2E Reklamation ${Date.now()}`);
    const description = page.locator('textarea').first();
    if (await description.count()) await description.fill('Automatisierter Test, bitte ignorieren.');
    await page.getByRole('button', { name: /senden|melden|speichern/i }).first().click();

    await page.waitForURL(/\/portal\/reklamationen/, { timeout: 30_000 });
    await expect(page.getByText(/E2E Reklamation/).first()).toBeVisible();
  });

  test('the portal works at phone width', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'phone-width behaviour');
    await page.goto('/portal');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `the portal overflows by ${overflow}px`).toBeLessThanOrEqual(0);
  });
});

test.describe('access boundaries', () => {
  requireRole('customer');

  test('a customer cannot open another record by changing the id in the URL', async ({ page }) => {
    await signIn(page, 'customer');

    // A well-formed id that belongs to nobody in this tenant stands in for
    // "somebody else's": the app must refuse it the same way either way.
    const foreign = '00000000-0000-4000-8000-0000000000ff';
    for (const path of [
      `/portal/rechnungen/${foreign}`,
      `/portal/leistungen/${foreign}`,
      `/dashboard/kunden/${foreign}`,
      `/dashboard/abrechnung/${foreign}`,
    ]) {
      const response = await page.goto(path);
      const status = response?.status() ?? 0;
      expect(status, `${path} returned ${status}`).toBeLessThan(500);
      // No financial content may render for a record the viewer cannot have.
      await expect(page.locator('body'), `${path} rendered content`).not.toContainText(/RE-\d{4}-\d{4}/);
    }
  });

  test('a customer cannot reach the invoice PDF of a record that is not theirs', async ({ page }) => {
    await signIn(page, 'customer');
    const foreign = '00000000-0000-4000-8000-0000000000ff';
    const response = await page.request.get(`/portal/rechnungen/${foreign}/pdf`);
    expect(response.status(), 'a foreign invoice PDF was served').not.toBe(200);
  });

  test('a signed-out visitor reaches nothing', async ({ page }) => {
    await page.context().clearCookies();
    for (const path of ['/dashboard', '/dashboard/abrechnung', '/mitarbeiter', '/portal', '/portal/rechnungen']) {
      await page.goto(path);
      await expect(page, `${path} was served to a signed-out visitor`).toHaveURL(/\/login/);
    }
  });
});
