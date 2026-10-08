import { credentialsFor, expect, label, requireRole, signIn, test } from '../fixtures';

/**
 * The two workflows that cross a role boundary, walked end to end in a browser.
 *
 * Both were reported as broken from manual acceptance testing, and both have
 * the same shape: one person asks, another decides, and the first must see the
 * answer. A unit test on either half would have passed while the journey stayed
 * broken — the vacation approval, for instance, failed only in the office's
 * click, having looked perfectly correct from the employee's side.
 *
 * So these tests drive two signed-in sessions at once, in separate browser
 * contexts, and assert what each role actually sees.
 */

test.describe('vacation approval', () => {
  requireRole('employee');
  requireRole('owner');
  test.slow();

  test('an employee requests, the office decides, and the employee sees the answer', async ({
    browser,
    baseURL,
  }) => {
    const note = label('Urlaub');
    // Far enough out that it cannot collide with planned work in a shared
    // staging environment, and unique per run through the note.
    const start = new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 122 * 86_400_000).toISOString().slice(0, 10);

    const employeeContext = await browser.newContext({ baseURL });
    const officeContext = await browser.newContext({ baseURL });
    try {
      const employee = await employeeContext.newPage();
      const office = await officeContext.newPage();
      await signIn(employee, 'employee');
      await signIn(office, 'owner');

      // --- The request -----------------------------------------------------
      await employee.goto('/mitarbeiter/abwesenheit');
      await employee.locator('select[name=type]').selectOption('VACATION');
      await employee.locator('input[name=start_date]').fill(start);
      await employee.locator('input[name=end_date]').fill(end);
      await employee.locator('textarea[name=note]').fill(note);
      await employee.getByRole('button', { name: /abwesenheit melden|antrag stellen|einreichen/i }).first().click();

      // The reported bug: this must not read "Genehmigt".
      const request = employee.locator('li', { hasText: note }).first();
      await expect(request).toBeVisible();
      await expect(request).toContainText(/offen|beantragt|ausstehend/i);
      await expect(request).not.toContainText(/genehmigt/i);

      // --- The decision ----------------------------------------------------
      await office.goto('/dashboard/urlaub-krankheit');
      const pending = office.locator('li', { hasText: note }).first();
      await expect(pending).toBeVisible();
      await expect(pending).toContainText(/offen/i);

      const approve = pending.getByRole('button', { name: /genehmigen/i });
      await expect(approve).toBeVisible();
      await approve.click();

      // Approved, and attributed: a decision with no timestamp is not a record.
      const decided = office.locator('li', { hasText: note }).first();
      await expect(decided).toContainText(/genehmigt/i);
      await expect(decided.getByRole('button', { name: /genehmigen/i })).toHaveCount(0);
      await expect(decided).toContainText(/\d{1,2}\.\s*\w+\.?\s*\d{4}|\d{2}\.\d{2}\.\d{4}/);

      // --- The employee sees the outcome ------------------------------------
      await employee.goto('/mitarbeiter/abwesenheit');
      await expect(employee.locator('li', { hasText: note }).first()).toContainText(/genehmigt/i);
    } finally {
      await employeeContext.close();
      await officeContext.close();
    }
  });

  test('an employee is never offered a decision on their own request', async ({ page }) => {
    await signIn(page, 'employee');
    await page.goto('/mitarbeiter/abwesenheit');
    await expect(page.getByRole('button', { name: /genehmigen|ablehnen/i })).toHaveCount(0);
  });

  test('a reported sickness is described as reported, not approved', async ({ page }) => {
    await signIn(page, 'employee');
    const note = label('Krankmeldung');
    const day = new Date(Date.now() + 100 * 86_400_000).toISOString().slice(0, 10);

    await page.goto('/mitarbeiter/abwesenheit');
    await page.locator('select[name=type]').selectOption('SICKNESS');
    await page.locator('input[name=start_date]').fill(day);
    await page.locator('input[name=end_date]').fill(day);
    await page.locator('textarea[name=note]').fill(note);
    await page.getByRole('button', { name: /abwesenheit melden|antrag stellen|einreichen/i }).first().click();

    // Nobody approves an illness. It takes effect at once and says "gemeldet".
    const entry = page.locator('li', { hasText: note }).first();
    await expect(entry).toBeVisible();
    await expect(entry).not.toContainText(/genehmigt/i);
    await expect(entry).toContainText(/gemeldet/i);
  });
});

test.describe('manual payment reconciliation', () => {
  requireRole('owner');
  test.slow();

  test.beforeEach(async ({ page }) => {
    await signIn(page, 'owner');
  });

  /** Opens an issued, unpaid invoice, or skips when this environment has none. */
  async function openPayableInvoice(page: import('@playwright/test').Page) {
    await page.goto('/dashboard/abrechnung');
    const open = page.locator('a[href*="/dashboard/abrechnung/"]');
    const count = await open.count();
    for (let index = 0; index < count; index += 1) {
      const href = await open.nth(index).getAttribute('href');
      if (!href || !/\/dashboard\/abrechnung\/[0-9a-f-]{36}$/.test(href)) continue;
      await page.goto(href);
      const hasPaymentForm = await page.locator('input[name=paid_on]').count();
      if (hasPaymentForm) return href;
    }
    return null;
  }

  test('an issued invoice becomes paid only through a confirmed payment', async ({ page }) => {
    const invoiceUrl = await openPayableInvoice(page);
    test.skip(!invoiceUrl, 'no issued, unpaid invoice in this environment');

    // The payment date is asked for, defaults to today, and cannot be future —
    // the money arrived when it arrived, which is rarely the day it is typed in.
    const paidOn = page.locator('input[name=paid_on]');
    await expect(paidOn).toBeVisible();
    const today = new Date().toISOString().slice(0, 10);
    expect(await paidOn.getAttribute('max')).toBe(today);

    // Method and reference are there for anyone who wants to reconcile properly.
    const detail = page.getByRole('button', { name: /zahlungsart|referenz|teilbetrag/i }).first();
    if (await detail.count()) await detail.click();
    const reference = label('Kontoauszug');
    await page.locator('select[name=method]').selectOption('BANK_TRANSFER');
    await page.locator('input[name=reference]').fill(reference);

    await page.getByRole('button', { name: /zahlungseingang bestätigen/i }).click();

    // --- Paid, and provably so -------------------------------------------
    await expect(page.getByText(/bezahlt/i).first()).toBeVisible();
    await expect(page.locator('input[name=paid_on]')).toHaveCount(0);

    // The audit trail is the point: who booked it, when, how, against what.
    const trail = page.getByRole('heading', { name: /zahlungseingänge/i });
    await expect(trail).toBeVisible();
    await expect(page.locator('body')).toContainText(reference);
    await expect(page.locator('body')).toContainText(/erfasst von/i);

    // --- And it cannot be booked twice ------------------------------------
    await page.goto(invoiceUrl!);
    await expect(page.getByRole('button', { name: /zahlungseingang bestätigen/i })).toHaveCount(0);
  });

  test('a customer sees the paid state but not the bookkeeping', async ({ page, browser, baseURL }) => {
    test.skip(!credentialsFor('customer'), 'no customer credentials in this environment');

    await page.goto('/dashboard/abrechnung');
    const paidLink = page.locator('a[href*="/dashboard/abrechnung/"]').filter({ hasText: /bezahlt/i }).first();
    test.skip((await paidLink.count()) === 0, 'no paid invoice in this environment');
    const number = (await paidLink.textContent())?.match(/RE-\d{4}-\d{4}/)?.[0] ?? null;
    test.skip(!number, 'could not identify a paid invoice number');

    const customerContext = await browser.newContext({ baseURL });
    try {
      const customer = await customerContext.newPage();
      await signIn(customer, 'customer');
      await customer.goto('/portal/rechnungen');

      const row = customer.locator('li, tr', { hasText: number! }).first();
      if (await row.count()) {
        await expect(row).toContainText(/bezahlt/i);
        // The office's reconciliation notes are not the customer's business.
        await expect(row).not.toContainText(/erfasst von|kontoauszug/i);
      }
    } finally {
      await customerContext.close();
    }
  });

  test('a draft invoice offers no way to record a payment', async ({ page }) => {
    await page.goto('/dashboard/abrechnung?status=DRAFT');
    const draft = page.locator('a[href*="/dashboard/abrechnung/"]').first();
    test.skip((await draft.count()) === 0, 'no draft invoice in this environment');
    await draft.click();
    await page.waitForURL(/\/dashboard\/abrechnung\/[0-9a-f-]{36}/);

    // A draft has not been sent to anyone, so nobody can have paid it.
    const editable = await page.getByRole('button', { name: /position hinzufügen/i }).count();
    test.skip(editable === 0, 'this invoice is not a draft');
    await expect(page.locator('input[name=paid_on]')).toHaveCount(0);
  });
});
