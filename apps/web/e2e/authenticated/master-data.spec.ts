import { expect, label, requireRole, signIn, test } from '../fixtures';

/**
 * Customers and objects: create, edit, connect, archive, restore.
 *
 * Everything created here is prefixed so it is identifiable and removable, and
 * the archive path doubles as this suite's cleanup — nothing is hard-deleted
 * by the product, so archiving is how a record stops being in the way.
 */

test.describe('customers and objects', () => {
  requireRole('owner');
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'owner');
  });

  test('a customer can be created, found and edited', async ({ page }) => {
    const name = label('Kunde');
    const edited = `${name} bearbeitet`;

    await page.goto('/dashboard/kunden/neu');
    await page.locator('input[name=name]').fill(name);
    await page.locator('input[name=email]').fill(`kunde-${Date.now()}@e2e.invalid`);
    await page.getByRole('button', { name: /kunde anlegen/i }).click();
    await page.waitForURL(/\/dashboard\/kunden/, { timeout: 30_000 });

    await page.goto('/dashboard/kunden');
    const row = page.getByRole('link', { name }).first();
    await expect(row).toBeVisible();

    await row.click();
    await page.waitForURL(/\/dashboard\/kunden\/[0-9a-f-]{36}/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name);

    await page.getByRole('link', { name: /bearbeiten/i }).first().click();
    await page.waitForURL(/bearbeiten/);
    await page.locator('input[name=name]').fill(edited);
    await page.getByRole('button', { name: /änderungen speichern/i }).click();

    await page.waitForURL(/\/dashboard\/kunden/, { timeout: 30_000 });
    await expect(page.getByText(edited).first()).toBeVisible();
  });

  test('an object belongs to a customer and shows on that customer', async ({ page }) => {
    const customerName = label('Objektkunde');
    const objectName = label('Objekt');

    await page.goto('/dashboard/kunden/neu');
    await page.locator('input[name=name]').fill(customerName);
    await page.getByRole('button', { name: /kunde anlegen/i }).click();
    await page.waitForURL(/\/dashboard\/kunden/, { timeout: 30_000 });

    await page.goto('/dashboard/objekte/neu');
    await page.locator('input[name=name]').fill(objectName);
    await page.locator('select[name=customer_id]').selectOption({ label: customerName });
    await page.locator('input[name=street]').fill('Teststraße 1');
    await page.locator('input[name=postal_code]').fill('20095');
    await page.locator('input[name=city]').fill('Hamburg');
    // The object form is a four-step wizard. Walk it like an office user; a
    // stale test that jumps straight to submit would never exercise the real UI.
    await page.getByRole('button', { name: /^weiter$/i }).click();
    await page.getByRole('button', { name: /^weiter$/i }).click();
    await page.getByRole('button', { name: /^weiter$/i }).click();
    await page.getByRole('button', { name: /objekt anlegen/i }).click();
    await page.waitForURL(/\/dashboard\/objekte/, { timeout: 30_000 });

    // The link is the assertion: the object must appear under its customer.
    await page.goto('/dashboard/kunden');
    await page.getByRole('link', { name: customerName }).first().click();
    await page.waitForURL(/\/dashboard\/kunden\/[0-9a-f-]{36}/);
    await expect(page.getByText(objectName).first()).toBeVisible();

    // Editing is part of the same master-data contract: the write must remain
    // tenant-scoped and the changed object must still belong to this customer.
    await page.getByText(objectName).first().click();
    await page.waitForURL(/\/dashboard\/objekte\/[0-9a-f-]{36}/);
    await page.getByRole('link', { name: /bearbeiten/i }).click();
    await page.waitForURL(/bearbeiten/);
    const editedObjectName = `${objectName} bearbeitet`;
    await page.locator('input[name=name]').fill(editedObjectName);
    await page.getByRole('button', { name: /^weiter$/i }).click();
    await page.getByRole('button', { name: /^weiter$/i }).click();
    await page.getByRole('button', { name: /^weiter$/i }).click();
    await page.getByRole('button', { name: /änderungen speichern/i }).click();
    await page.waitForURL(/\/dashboard\/objekte\/[0-9a-f-]{36}/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1 })).toContainText(editedObjectName);
    await expect(page.getByRole('link', { name: customerName })).toBeVisible();
  });

  test('archiving hides a customer from the active list, and restoring brings it back', async ({ page }) => {
    const name = label('Archivkunde');

    await page.goto('/dashboard/kunden/neu');
    await page.locator('input[name=name]').fill(name);
    await page.getByRole('button', { name: /kunde anlegen/i }).click();
    await page.waitForURL(/\/dashboard\/kunden/, { timeout: 30_000 });

    await page.goto('/dashboard/kunden');
    await page.getByRole('link', { name }).first().click();
    await page.waitForURL(/\/dashboard\/kunden\/[0-9a-f-]{36}/);
    const detailUrl = page.url();

    await page.getByRole('button', { name: /archivieren/i }).click();
    await page.getByRole('button', { name: /archivieren/i }).last().click();
    await expect(page.getByText(/archiviert/i).first()).toBeVisible();

    // Gone from the active list…
    await page.goto('/dashboard/kunden');
    await expect(page.getByRole('link', { name })).toHaveCount(0);

    // …and back once reactivated.
    await page.goto(detailUrl);
    await page.getByRole('button', { name: /reaktivieren/i }).click();
    await page.getByRole('button', { name: /reaktivieren/i }).last().click();

    await page.goto('/dashboard/kunden');
    await expect(page.getByRole('link', { name }).first()).toBeVisible();
  });

  test('a customer cannot be saved without a name', async ({ page }) => {
    await page.goto('/dashboard/kunden/neu');
    await page.getByRole('button', { name: /kunde anlegen/i }).click();
    // Still on the form, with something said about it.
    await expect(page).toHaveURL(/neu/);
    await expect(page.locator('p[role=alert]').first()).toBeVisible();
  });
});

test.describe('employees', () => {
  requireRole('owner');

  test('an invitation can be prepared and the member appears as invited', async ({ page }) => {
    await signIn(page, 'owner');
    const first = label('Mitarbeiter').replace(/\s+/g, '');
    const email = `mitarbeiter-${Date.now()}@e2e.invalid`;

    await page.goto('/dashboard/mitarbeiter/neu');
    await page.locator('input[name=first_name]').fill(first);
    await page.locator('input[name=last_name]').fill('Test');
    await page.locator('input[name=email]').fill(email);
    await page.getByRole('button', { name: /einladung erstellen/i }).click();

    await page.waitForURL(/\/dashboard\/mitarbeiter/, { timeout: 30_000 });
    await page.goto('/dashboard/mitarbeiter');
    await expect(page.getByText(first).first()).toBeVisible();
    // The relationship that matters: invited, in this company, not yet active.
    await expect(page.getByText(/eingeladen/i).first()).toBeVisible();
  });
});
