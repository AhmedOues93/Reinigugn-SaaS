import { credentialsFor, expect, requireRole, signIn, test } from '../fixtures';

/**
 * Kundenabnahme, from the field app through the portal to the billing queue.
 *
 * These assertions are about the boundaries between the three roles, which is
 * where the workflow can go quietly wrong: an employee offered a choice they
 * should not have, a customer shown somebody else's visit, work reaching the
 * billing queue before anyone accepted it.
 *
 * The database enforces all of it and the SQL suite proves that. This is the
 * other half: a screen that offers a button the server would refuse is still a
 * defect, and a screen that hides one the workflow needs is worse.
 */

test.describe('office billing queue', () => {
  requireRole('owner');
  test.slow();

  test.beforeEach(async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/dashboard/leistungsnachweise');
  });

  test('groups completed work by what has to happen to it next', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: /leistungsnachweise/i })).toBeVisible();

    // The four states the office actually works through.
    const tabs = page.getByRole('navigation', { name: /abrechnungsstatus/i });
    await expect(tabs).toBeVisible();
    for (const label of [/bereit zur abrechnung/i, /abnahme ausstehend/i, /problem gemeldet/i, /abgerechnet/i]) {
      await expect(tabs.getByRole('link', { name: label })).toBeVisible();
    }

    // The default is the one that turns into money.
    await expect(tabs.getByRole('link', { name: /bereit zur abrechnung/i })).toHaveAttribute('aria-current', 'page');
  });

  test('work waiting for an acceptance is not offered for invoicing', async ({ page }) => {
    await page.goto('/dashboard/leistungsnachweise?filter=ABNAHME_AUSSTEHEND');
    const rows = page.locator('tbody tr, li').filter({ hasText: /abnahme offen/i });
    const count = await rows.count();
    test.skip(count === 0, 'no visit is waiting for an acceptance in this environment');

    // No "Abrechnen" shortcut on a row that is not billable yet.
    await expect(rows.first().getByRole('link', { name: /abrechnen/i })).toHaveCount(0);
  });

  test('the queue names the acceptance rule that applies', async ({ page }) => {
    await page.goto('/dashboard/leistungsnachweise?filter=ALLE');
    const body = page.locator('body');
    const hasRows = await page.locator('tbody tr').count();
    test.skip(hasRows === 0, 'no completed visit in this environment');
    // Whichever policy the contracts use, the column says which one it is.
    await expect(body).toContainText(/keine abnahme|unterschrift vor ort|portal-abnahme/i);
  });
});

test.describe('the contract carries the acceptance rule', () => {
  requireRole('owner');
  test.slow();

  test('the Leistungsplan is where it is set, with the safe default', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/dashboard/planung/plaene/neu');

    const policy = page.locator('select[name=acceptance_policy]');
    await expect(policy).toBeVisible();
    // A plan that says nothing asks nothing of the customer.
    await expect(policy).toHaveValue('KEINE_ABNAHME_ERFORDERLICH');
    await expect(policy.locator('option')).toHaveCount(3);

    // And a price that says nothing is a price per visit, not per hour.
    const mode = page.locator('select[name=billing_mode]');
    await expect(mode).toBeVisible();
    await expect(mode).toHaveValue('PAUSCHALE_PRO_EINSATZ');
  });
});

test.describe('the employee is never asked to choose', () => {
  requireRole('employee');
  test.slow();

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'the field app is a phone app');
    await signIn(page, 'employee');
  });

  test('no acceptance-method picker appears anywhere in the field app', async ({ page }) => {
    await page.goto('/mitarbeiter/einsaetze');
    const job = page.locator('a[href*="/mitarbeiter/einsaetze/"]').first();
    test.skip((await job.count()) === 0, 'no job assigned to this employee in this environment');
    await job.click();
    await page.waitForURL(/\/mitarbeiter\/einsaetze\/[0-9a-f-]{36}/);

    // The contract decided this. The cleaner at the door does not.
    await expect(page.locator('select[name=acceptance_policy]')).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: /abnahme|unterschrift/i })).toHaveCount(0);
  });

  test('when a signature is required, the panel asks for a name and a signature', async ({ page }) => {
    await page.goto('/mitarbeiter/einsaetze');
    const links = page.locator('a[href*="/mitarbeiter/einsaetze/"]');
    const total = await links.count();
    let found = false;

    for (let index = 0; index < total; index += 1) {
      const href = await links.nth(index).getAttribute('href');
      if (!href) continue;
      await page.goto(href);
      if (await page.locator('input[name=signer_name]').count()) {
        found = true;
        break;
      }
      await page.goto('/mitarbeiter/einsaetze');
    }
    test.skip(!found, 'no finished visit requires an on-site signature in this environment');

    // The name of the person accepting is the evidence; the drawing is support.
    await expect(page.locator('input[name=signer_name]')).toBeVisible();
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByRole('button', { name: /abnahme bestätigen/i })).toBeVisible();

    // The canvas must not swallow the page scroll on a phone.
    const touchAction = await page.locator('canvas').evaluate((node) => getComputedStyle(node).touchAction);
    expect(touchAction).toBe('none');
  });
});

test.describe('customer acceptance in the portal', () => {
  requireRole('customer');
  test.slow();

  test.beforeEach(async ({ page }) => {
    await signIn(page, 'customer');
  });

  test('services and invoices stay separate', async ({ page }) => {
    await page.goto('/portal/leistungen');
    await expect(page).toHaveURL(/\/portal\/leistungen/);

    // A customer confirms a service. They are never asked to approve an invoice.
    await page.goto('/portal/rechnungen');
    await expect(page.getByRole('button', { name: /leistung bestätigen/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /rechnung (bestätigen|freigeben|genehmigen)/i })).toHaveCount(0);
  });

  test('an outstanding acceptance offers both answers, not just approval', async ({ page }) => {
    await page.goto('/portal/leistungen');
    const pending = page.locator('a[href*="/portal/leistungen/"]').filter({ hasText: /abnahme offen/i }).first();
    test.skip((await pending.count()) === 0, 'nothing is waiting for this customer to accept');

    await pending.click();
    await page.waitForURL(/\/portal\/leistungen\/[0-9a-f-]{36}/);

    // Confirming and objecting are both first-class. Offering only the first
    // would make silence the only way to disagree.
    await expect(page.getByRole('button', { name: /leistung bestätigen/i })).toBeVisible();
    const problem = page.getByRole('button', { name: /problem melden/i });
    await expect(problem).toBeVisible();

    // Reporting a problem asks what was wrong rather than editing the record.
    await problem.click();
    await expect(page.locator('input[name=title]')).toBeVisible();
    await expect(page.locator('textarea[name=description]')).toBeVisible();
  });

  test('a customer cannot reach another customer by guessing a job id', async ({ page }) => {
    // A well-formed id that is not theirs resolves to nothing, not to somebody
    // else's service record.
    const response = await page.goto('/portal/leistungen/00000000-0000-4000-8000-000000000000');
    expect(response?.status()).toBe(404);
  });
});

test.describe('acceptance gates billing end to end', () => {
  requireRole('owner');
  requireRole('customer');
  test.slow();

  test('a confirmed service reaches the billing queue; an unconfirmed one does not', async ({
    browser,
    baseURL,
  }) => {
    test.skip(!credentialsFor('customer'), 'no customer credentials in this environment');

    const officeContext = await browser.newContext({ baseURL });
    const customerContext = await browser.newContext({ baseURL });
    try {
      const office = await officeContext.newPage();
      const customer = await customerContext.newPage();
      await signIn(office, 'owner');
      await signIn(customer, 'customer');

      // Find something the customer has been asked to accept.
      await customer.goto('/portal/leistungen');
      const pending = customer
        .locator('a[href*="/portal/leistungen/"]')
        .filter({ hasText: /abnahme offen/i })
        .first();
      test.skip((await pending.count()) === 0, 'nothing is waiting for this customer to accept');

      const href = await pending.getAttribute('href');
      const jobId = href?.match(/([0-9a-f-]{36})$/)?.[1];
      test.skip(!jobId, 'could not identify the visit');

      // Before: the office sees it as waiting, not as ready.
      await office.goto('/dashboard/leistungsnachweise?filter=ABNAHME_AUSSTEHEND&from=2000-01-01');
      await expect(office.locator(`a[href*="${jobId}"]`).first()).toBeVisible();

      // The customer confirms.
      await customer.goto(href!);
      await customer.getByRole('button', { name: /leistung bestätigen/i }).click();
      await expect(customer.getByText(/leistung abgenommen|bestätigt/i).first()).toBeVisible();

      // After: it moves into the queue that turns into invoices.
      await office.goto('/dashboard/leistungsnachweise?filter=BEREIT&from=2000-01-01');
      await expect(office.locator(`a[href*="${jobId}"]`).first()).toBeVisible();

      // And the acceptance is attributed, not just flagged.
      await office.goto(`/dashboard/auftraege/${jobId}/leistungsnachweis`);
      await expect(office.getByRole('heading', { name: /kundenabnahme/i })).toBeVisible();
      await expect(office.locator('body')).toContainText(/im kundenportal bestätigt/i);
      await expect(office.locator('body')).toContainText(/protokoll/i);
    } finally {
      await officeContext.close();
      await customerContext.close();
    }
  });
});
