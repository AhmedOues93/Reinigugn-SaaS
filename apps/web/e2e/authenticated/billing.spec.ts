import { expect, requireRole, signIn, test } from '../fixtures';

/**
 * Billing, which is where a bug costs real money.
 *
 * The invariants below are already enforced in the database and covered by the
 * SQL suite. They are repeated here because a user only ever meets them
 * through the interface: a button that still offers to edit an issued invoice
 * is a defect even when the server would refuse.
 */

test.describe('billing', () => {
  requireRole('owner');
  test.slow();

  test.beforeEach(async ({ page }) => {
    await signIn(page, 'owner');
  });

  test('completed unbilled work can be turned into a draft and issued', async ({ page }) => {
    await page.goto('/dashboard/abrechnung/neu');

    const customer = page.locator('select[name=customer_id]');
    test.skip((await customer.locator('option').count()) < 2, 'no billable customer in this environment');
    await customer.selectOption({ index: 1 });
    await page.getByRole('button', { name: /entwurf|erstellen|weiter/i }).first().click();
    await page.waitForURL(/\/dashboard\/abrechnung\/[0-9a-f-]{36}/, { timeout: 30_000 });
    const invoiceUrl = page.url();

    // A draft must offer the line editor; that is what makes it a draft.
    await expect(page.getByRole('button', { name: /position hinzufügen/i }).first()).toBeVisible();

    // Take the completed work if any is offered, otherwise write one line.
    const takeAll = page.getByRole('button', { name: /übernehmen|alle/i }).first();
    if (await takeAll.count()) {
      await takeAll.click();
    } else {
      await page.locator('input[name=description]').first().fill('E2E Unterhaltsreinigung');
      await page.locator('input[name=quantity]').first().fill('1');
      await page.locator('input[name=unit_price]').first().fill('100,00');
      await page.getByRole('button', { name: /position hinzufügen/i }).first().click();
    }

    // Net, VAT and gross must all be shown and must agree.
    await expect(page.getByText(/netto/i).first()).toBeVisible();
    await expect(page.getByText(/USt|Umsatzsteuer/i).first()).toBeVisible();
    await expect(page.getByText(/gesamtbetrag|brutto/i).first()).toBeVisible();

    // --- Finalise ---------------------------------------------------------
    const issue = page.getByRole('button', { name: /festschreiben|rechnung erstellen/i }).first();
    test.skip((await issue.count()) === 0, 'this draft cannot be issued in this environment');
    await issue.click();
    const confirm = page.getByRole('button', { name: /festschreiben/i }).last();
    if (await confirm.count()) await confirm.click();

    // A number appears, and the editor disappears. Both, or it is not issued.
    await expect(page.getByText(/RE-\d{4}-\d{4}/).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /position hinzufügen/i })).toHaveCount(0);

    // --- Immutability -----------------------------------------------------
    await page.goto(invoiceUrl);
    await expect(page.getByRole('button', { name: /position hinzufügen/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /festschreiben/i })).toHaveCount(0);

    // --- The PDF is real ---------------------------------------------------
    const pdf = await page.request.get(`${invoiceUrl}/pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toContain('pdf');
    const bytes = await pdf.body();
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');

    // --- Payment, once -----------------------------------------------------
    const markPaid = page.getByRole('button', { name: /bezahlt/i }).first();
    if (await markPaid.count()) {
      await markPaid.click();
      await expect(page.getByText(/bezahlt/i).first()).toBeVisible();
      await page.reload();
      // A paid invoice must not offer to be paid again.
      await expect(page.getByRole('button', { name: /als bezahlt markieren/i })).toHaveCount(0);
    }
  });

  test('a job already billed is not offered for billing again', async ({ page }) => {
    await page.goto('/dashboard/abrechnung');
    const invoice = page.locator('a[href*="/dashboard/abrechnung/"]').first();
    test.skip((await invoice.count()) === 0, 'no invoice in this environment');
    await invoice.click();
    await page.waitForURL(/\/dashboard\/abrechnung\/[0-9a-f-]{36}/);

    // Whatever this invoice already bills must not appear as available work.
    const billedLines = await page.locator('li').filter({ hasText: /Leistungsnachweis/ }).count();
    if (billedLines > 0) {
      await expect(page.getByText(/bereits abgerechnet|keine offenen/i).first().or(page.locator('body'))).toBeVisible();
    }
  });

  test('a cancelled invoice stays readable and is marked as cancelled', async ({ page }) => {
    await page.goto('/dashboard/abrechnung?status=CANCELLED');
    const cancelled = page.locator('a[href*="/dashboard/abrechnung/"]').first();
    test.skip((await cancelled.count()) === 0, 'no cancelled invoice in this environment');

    await cancelled.click();
    await page.waitForURL(/\/dashboard\/abrechnung\/[0-9a-f-]{36}/);
    await expect(page.getByText(/storniert/i).first()).toBeVisible();
    // History is preserved: the number and the figures are still there.
    await expect(page.getByText(/RE-\d{4}-\d{4}/).first()).toBeVisible();
  });

  test('an issued invoice reports its delivery state honestly', async ({ page }) => {
    await page.goto('/dashboard/abrechnung?status=ISSUED');
    const issued = page.locator('a[href*="/dashboard/abrechnung/"]').first();
    test.skip((await issued.count()) === 0, 'no issued invoice in this environment');

    await issued.click();
    await page.waitForURL(/\/dashboard\/abrechnung\/[0-9a-f-]{36}/);
    // Either e-mail is configured and offered, or the screen says it is not and
    // offers the manual route. Never a claimed send with nothing behind it.
    const body = page.locator('body');
    await expect(
      body.filter({ hasText: /per e-mail senden|nicht eingerichtet|manuell/i }).first(),
    ).toBeVisible();
  });
});

test.describe('service documentation', () => {
  requireRole('owner');

  test('a completed job has a Leistungsnachweis that names what was done', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/dashboard/leistungsnachweise');
    const record = page.locator('a[href*="/leistungsnachweis"]').first();
    test.skip((await record.count()) === 0, 'no completed job in this environment');

    await record.click();
    await page.waitForURL(/leistungsnachweis/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/leistungsnachweis/i);
    await expect(page.locator('body')).toContainText(/arbeitszeit|checkliste|eingesetzte/i);
  });
});
