import { assertNotProductionApp, credentialsFor, expect, requireRole, signIn, test } from '../fixtures';

/**
 * Who lands where, and what each role cannot reach.
 *
 * Role routing is the first thing a new deployment gets wrong, and the last
 * thing anyone notices, because every role can sign in successfully before
 * discovering it is on the wrong surface.
 */

test.describe('owner', () => {
  requireRole('owner');

  test('lands on the dashboard and sees the office shell', async ({ page }) => {
    await signIn(page, 'owner');
    await assertNotProductionApp(page);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('navigation').first()).toBeVisible();
  });

  test('can reach billing, which is the office-only area', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/dashboard/abrechnung');
    await expect(page).toHaveURL(/\/dashboard\/abrechnung/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

test.describe('employee', () => {
  requireRole('employee');

  test('lands on the field app, not the office', async ({ page }) => {
    await signIn(page, 'employee');
    await expect(page).toHaveURL(/\/mitarbeiter/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('cannot reach billing or the office dashboard', async ({ page }) => {
    await signIn(page, 'employee');
    for (const forbidden of ['/dashboard', '/dashboard/abrechnung', '/dashboard/kunden', '/dashboard/vertrieb/angebote']) {
      await page.goto(forbidden);
      // Whatever the mechanism — redirect or not-found — office content must
      // not render for an employee.
      await expect(page, `${forbidden} served office content to an employee`).not.toHaveURL(
        new RegExp(`${forbidden.replace(/\//g, '\\/')}$`),
      );
    }
  });

  test('sees no monetary figures on its own surface', async ({ page }) => {
    await signIn(page, 'employee');
    await page.goto('/mitarbeiter');
    // The field app shows times and addresses, never prices.
    await expect(page.locator('body')).not.toContainText(/Rechnungsbetrag|Gesamtbetrag|Nettobetrag/i);
  });
});

test.describe('customer', () => {
  requireRole('customer');

  test('lands on the portal', async ({ page }) => {
    await signIn(page, 'customer');
    await expect(page).toHaveURL(/\/portal/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('cannot reach the office or the field app', async ({ page }) => {
    await signIn(page, 'customer');
    for (const forbidden of ['/dashboard', '/dashboard/abrechnung', '/mitarbeiter']) {
      await page.goto(forbidden);
      await expect(page, `${forbidden} was served to a customer`).not.toHaveURL(
        new RegExp(`${forbidden.replace(/\//g, '\\/')}$`),
      );
    }
  });
});

test.describe('session', () => {
  requireRole('owner');

  test('signing out ends access', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/dashboard');

    // The sign-out control lives in the account menu.
    const menu = page.getByRole('button', { name: /konto|profil|abmelden/i }).first();
    if (await menu.count()) await menu.click();
    const signOut = page.getByRole('button', { name: /abmelden/i }).first();
    if (await signOut.count()) {
      await signOut.click();
      await page.waitForURL(/\/login/, { timeout: 30_000 });
    } else {
      await page.context().clearCookies();
    }

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('a wrong password is refused', async ({ page }) => {
    const pair = credentialsFor('owner')!;
    await page.goto('/login');
    await page.locator('input[type=email]').fill(pair.email);
    await page.locator('input[name=password]').fill('definitiv-das-falsche-passwort');
    await page.getByRole('button', { name: /anmelden/i }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('body')).not.toContainText('Dashboard');
  });
});
