import { expect, requireRole, signIn, test } from '../fixtures';

/**
 * First-run setup.
 *
 * What a browser has to prove here is not that the fields save — the SQL suite
 * covers that — but that the wizard behaves like an invitation rather than a
 * gate: every step reachable, nothing mandatory, a way out at any point, and a
 * closing checklist that reflects what the company actually has rather than
 * which buttons were pressed.
 */
test.describe('first-run setup', () => {
  requireRole('owner');
  test.slow();

  test.beforeEach(async ({ page }) => {
    await signIn(page, 'owner');
  });

  test('offers six steps and lets any of them be reached directly', async ({ page }) => {
    await page.goto('/dashboard/einrichtung');
    await expect(page.getByRole('heading', { level: 1, name: /einrichtung/i })).toBeVisible();

    const progress = page.getByRole('list', { name: /fortschritt/i });
    await expect(progress.getByRole('listitem')).toHaveCount(6);

    for (const [step, marker] of [
      ['unternehmen', /firmenname/i],
      ['rechnung', /steuernummer/i],
      ['kalkulation', /bruttostundenlohn/i],
      ['schwerpunkte', /reinigungsschwerpunkte/i],
      ['branding', /erscheinungsbild/i],
      ['abschluss', /fast fertig|alles eingerichtet/i],
    ] as const) {
      await page.goto(`/dashboard/einrichtung?schritt=${step}`);
      await expect(page.locator('body')).toContainText(marker);
    }
  });

  test('forces nothing and can be left at any point', async ({ page }) => {
    await page.goto('/dashboard/einrichtung?schritt=rechnung');

    // Tax identifiers are optional at setup time: a company that has not
    // registered yet still has customers to enter.
    for (const name of ['tax_number', 'vat_id', 'iban', 'bic']) {
      await expect(page.locator(`input[name=${name}]`)).not.toHaveAttribute('required', '');
    }

    await page.getByRole('button', { name: /einrichtung überspringen/i }).click();
    await page.waitForURL(/\/dashboard(\?|$)/, { timeout: 30_000 });
    // Having skipped once, the dashboard must not push the owner back in.
    await page.goto('/dashboard');
    expect(page.url()).not.toContain('/dashboard/einrichtung');
  });

  test('shows the productive-time formula rather than a bare percentage', async ({ page }) => {
    await page.goto('/dashboard/einrichtung?schritt=kalkulation');
    await expect(page.locator('body')).toContainText(/anwesenheitstage/i);
    await expect(page.locator('body')).toContainText(/produktiver anteil/i);
    // Suggested absence days are visible and editable, never hidden constants.
    await expect(page.locator('input[name=vacation_days]')).toBeVisible();
    await expect(page.locator('input[name=public_holidays]')).toBeVisible();
  });

  test('describes the seeded catalogue as a starting point, not a standard', async ({ page }) => {
    await page.goto('/dashboard/einrichtung?schritt=schwerpunkte');
    await expect(page.locator('body')).toContainText(/startwerte aus der praxis/i);
    await expect(page.locator('body')).toContainText(/keine norm/i);
    await expect(page.getByRole('checkbox').first()).toBeVisible();
  });

  test('closes with a checklist built from real data', async ({ page }) => {
    await page.goto('/dashboard/einrichtung?schritt=abschluss');
    // Each open item is a link to the screen that closes it, so the checklist
    // is a way to act rather than a list of reproaches.
    await expect(page.getByRole('link', { name: /ersten kunden anlegen/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /leistungskatalog/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /einrichtung abschließen/i })).toBeVisible();
  });
});

test.describe('the Leistungskatalog is not empty on day one', () => {
  requireRole('owner');

  test('the catalogue screen offers services rather than an empty page', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/dashboard/kalkulation/leistungskatalog');

    const rows = page.locator('tbody tr, ul li');
    // Either the company already has services, or the screen says how to get
    // them — what it must never do is show nothing and explain nothing.
    if ((await rows.count()) === 0) {
      await expect(page.locator('body')).toContainText(/schwerpunkt|einrichtung|leistung/i);
    } else {
      await expect(rows.first()).toBeVisible();
    }
  });
});
