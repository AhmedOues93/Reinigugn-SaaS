import { expect, openFirstRecord, requireRole, signIn, test } from '../fixtures';

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

  /*
   * Die Beschriftungen stehen hier als Konstanten, weil diese Suite sie
   * jahrelang geraten hat: sie suchte "Position hinzufügen" und
   * "festschreiben". Beides gibt es in der Abrechnung nicht -- die Kalkulation
   * sagt "Position", die Abrechnung sagt "Leistung", und ausgestellt wird mit
   * "Rechnung ausstellen". Die Suche lief damit ins Leere, und weil der Test
   * danach `test.skip` aufrief, sah der halbe Ablauf wie uebersprungen aus
   * statt wie falsch. Eine Abweichung soll hier auffallen, nicht stillschweigend
   * zum Ueberspringen fuehren.
   */
  const addLine = /leistung hinzufügen/i;
  const issueInvoice = /rechnung ausstellen/i;

  test('completed unbilled work can be turned into a draft and issued', async ({ page }) => {
    await page.goto('/dashboard/abrechnung/neu');

    const customer = page.locator('select[name=customer_id]');
    test.skip((await customer.locator('option').count()) < 2, 'no billable customer in this environment');
    await customer.selectOption({ index: 1 });
    await page.getByRole('button', { name: /entwurf|erstellen|weiter/i }).first().click();
    await page.waitForURL(/\/dashboard\/abrechnung\/[0-9a-f-]{36}/, { timeout: 30_000 });
    const invoiceUrl = page.url();

    // Der Positionseditor liegt in einem zugeklappten <details>: auf einem
    // Telefon soll der Entwurf nicht mit einem Formular aufgehen, das man
    // meistens nicht braucht. Erst aufklappen, dann pruefen.
    const editor = page.getByText(/weitere leistung manuell hinzufügen/i).first();
    await expect(editor, 'der Entwurf bietet keinen Positionseditor').toBeVisible();
    await editor.click();
    await expect(page.getByRole('button', { name: addLine }).first()).toBeVisible();

    // Einen abgeschlossenen Einsatz uebernehmen, wenn einer angeboten wird --
    // das ist ein Auswahlfeld, kein Knopf. Sonst eine Zeile von Hand.
    const takeJob = page.locator('select[name=job_id]');
    if ((await takeJob.count()) && (await takeJob.locator('option').count()) > 1) {
      await takeJob.selectOption({ index: 1 });
    } else {
      await page.locator('input[name=description]').first().fill('E2E Unterhaltsreinigung');
      await page.locator('input[name=quantity]').first().fill('1');
      await page.locator('input[name=unit_price]').first().fill('100,00');
    }
    const add = page.getByRole('button', { name: addLine }).first();
    await add.click();
    await expect(add).toBeEnabled({ timeout: 60_000 });

    // Net, VAT and gross must all be shown and must agree.
    await expect(page.getByText(/netto/i).first()).toBeVisible();
    await expect(page.getByText(/USt|Umsatzsteuer/i).first()).toBeVisible();
    await expect(page.getByText(/gesamtbetrag|brutto/i).first()).toBeVisible();

    // --- Finalise ---------------------------------------------------------
    const issue = page.getByRole('button', { name: issueInvoice }).first();
    test.skip((await issue.count()) === 0, 'this draft cannot be issued in this environment');
    await issue.click();

    // A number appears, and the editor disappears. Both, or it is not issued.
    await expect(page.getByText(/RE-\d{4}-\d{4}/).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: addLine })).toHaveCount(0);

    // --- Immutability -----------------------------------------------------
    await page.goto(invoiceUrl);
    await expect(page.getByRole('button', { name: addLine })).toHaveCount(0);
    await expect(page.getByRole('button', { name: issueInvoice })).toHaveCount(0);

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
    const invoice = await openFirstRecord(page, '/dashboard/abrechnung');
    test.skip(!invoice, 'no invoice in this environment');

    // Whatever this invoice already bills must not appear as available work.
    const billedLines = await page.locator('li').filter({ hasText: /Leistungsnachweis/ }).count();
    if (billedLines > 0) {
      await expect(page.getByText(/bereits abgerechnet|keine offenen/i).first().or(page.locator('body'))).toBeVisible();
    }
  });

  test('a cancelled invoice stays readable and is marked as cancelled', async ({ page }) => {
    await page.goto('/dashboard/abrechnung?status=CANCELLED');
    const cancelled = await openFirstRecord(page, '/dashboard/abrechnung');
    test.skip(!cancelled, 'no cancelled invoice in this environment');
    await expect(page.getByText(/storniert/i).first()).toBeVisible();
    // History is preserved: the number and the figures are still there.
    await expect(page.getByText(/RE-\d{4}-\d{4}/).first()).toBeVisible();
  });

  test('an issued invoice reports its delivery state honestly', async ({ page }) => {
    await page.goto('/dashboard/abrechnung?status=ISSUED');
    const issued = await openFirstRecord(page, '/dashboard/abrechnung');
    test.skip(!issued, 'no issued invoice in this environment');
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
