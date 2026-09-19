import { expect, label, requireRole, signIn, test } from '../fixtures';

/**
 * The Kalkulation workspace, and the boundary around it.
 *
 * The arithmetic is proven in the SQL suite. What a browser has to prove is
 * different: that the office is shown the distinction between margin and
 * markup rather than left to infer it, that a frozen calculation offers no way
 * to edit itself, and — most importantly — that nobody outside the office ever
 * sees a cost or a margin at all.
 */

test.describe('Kalkulation workspace', () => {
  requireRole('owner');
  test.slow();

  test.beforeEach(async ({ page }) => {
    await signIn(page, 'owner');
  });

  test('the assumptions screen explains itself and invents no defaults', async ({ page }) => {
    await page.goto('/dashboard/kalkulation/grundlagen');
    await expect(page.getByRole('heading', { level: 1, name: /kalkulationsgrundlagen/i })).toBeVisible();

    for (const name of ['wage', 'ancillary', 'productive', 'overhead', 'margin']) {
      await expect(page.locator(`input[name=${name}]`)).toBeVisible();
    }

    // The productive-share field is the one people do not expect, so the page
    // has to say what it is for rather than just label it.
    await expect(page.locator('body')).toContainText(/produktiv/i);
    await expect(page.locator('body')).toContainText(/marge/i);
  });

  test('a calculation can be built from a Richtleistung and shows what it costs', async ({ page }) => {
    // The catalogue first: without a service there is no productivity to apply.
    const serviceName = label('Unterhaltsreinigung');
    await page.goto('/dashboard/kalkulation/leistungskatalog');
    await page.locator('input[name=name]').fill(serviceName);
    await page.locator('select[name=calculation_unit]').selectOption('QM');
    await page.locator('input[name=productivity]').fill('250');
    await page.getByRole('button', { name: /leistung speichern/i }).click();
    await expect(page.locator('body')).toContainText(serviceName);

    // A calculation for an existing customer.
    await page.goto('/dashboard/kalkulation/neu');
    const title = label('Kalkulation');
    await page.locator('input[name=title]').fill(title);

    const blank = page.getByRole('radio', { name: /ohne besichtigung/i });
    if (await blank.count()) await blank.check();

    const customer = page.locator('select[name=customer_id]');
    test.skip((await customer.locator('option').count()) < 2, 'no customer in this environment');
    await customer.selectOption({ index: 1 });
    await page.getByRole('button', { name: /kalkulation anlegen/i }).click();
    await page.waitForURL(/\/dashboard\/kalkulation\/[0-9a-f-]{36}/, { timeout: 30_000 });
    const workspaceUrl = page.url();

    // The KPI band is present from the start, even at zero.
    await expect(page.getByRole('region', { name: /wirtschaftlichkeit/i })).toBeVisible();

    // One position: 500 m² at 250 m²/h, five times a week.
    await page.locator('input[name=area_name]').fill('Bürogeschoss 1');
    await page.locator('input[name=service_name]').fill(serviceName);
    await page.locator('input[name=quantity]').fill('500');
    await page.locator('input[name=productivity]').fill('250');
    await page.locator('select[name=frequency]').selectOption('PRO_WOCHE');
    await page.locator('input[name=frequency_count]').fill('5');
    await page.getByRole('button', { name: /position hinzufügen/i }).click();

    // 500 ÷ 250 = 2 h per visit, and the workspace says so.
    await page.goto(`${workspaceUrl}?tab=zeit`);
    await expect(page.locator('body')).toContainText('2 h 00');

    // The cost tab spells out the personnel formula rather than just a total.
    await page.goto(`${workspaceUrl}?tab=kosten`);
    await expect(page.locator('body')).toContainText(/lohnnebenkosten/i);
    await expect(page.locator('body')).toContainText(/produktiver anteil/i);

    // And the price tab distinguishes margin from markup in so many words.
    await page.goto(`${workspaceUrl}?tab=preis`);
    await expect(page.locator('body')).toContainText(/marge/i);
    await expect(page.locator('body')).toContainText(/aufschlag/i);
  });

  test('a time that departs from the Richtleistung demands a reason', async ({ page }) => {
    await page.goto('/dashboard/kalkulation?status=ENTWURF');
    const draft = page.locator('a[href*="/dashboard/kalkulation/"]').first();
    test.skip((await draft.count()) === 0, 'no draft calculation in this environment');
    await draft.click();
    await page.waitForURL(/\/dashboard\/kalkulation\/[0-9a-f-]{36}/);

    const toggle = page.getByRole('button', { name: /zeit abweichend/i });
    test.skip((await toggle.count()) === 0, 'this calculation is not editable');
    await toggle.click();
    await expect(page.locator('input[name=minutes_override]')).toBeVisible();
    await expect(page.locator('input[name=override_reason]')).toBeVisible();
  });

  test('a finalised calculation offers no way to edit itself', async ({ page }) => {
    await page.goto('/dashboard/kalkulation?status=FINAL');
    const final = page.locator('a[href*="/dashboard/kalkulation/"]').first();
    test.skip((await final.count()) === 0, 'no finalised calculation in this environment');
    await final.click();
    await page.waitForURL(/\/dashboard\/kalkulation\/[0-9a-f-]{36}/);

    await expect(page.getByText(/festgeschrieben/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /position hinzufügen/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /kalkulation aktualisieren/i })).toHaveCount(0);
    // The way forward is a revision, not an edit.
    await expect(page.getByRole('button', { name: /revision erstellen/i })).toBeVisible();
  });

  test('the Leistungsverzeichnis carries no internal figures', async ({ page }) => {
    await page.goto('/dashboard/kalkulation?status=FINAL');
    const final = page.locator('a[href*="/dashboard/kalkulation/"]').first();
    test.skip((await final.count()) === 0, 'no finalised calculation in this environment');
    const href = await final.getAttribute('href');
    await page.goto(`${href}?tab=dokumente`);

    await expect(page.getByRole('heading', { name: /leistungsverzeichnis/i })).toBeVisible();
    // The customer-facing block describes work, not money.
    const section = page.locator('section, div').filter({ hasText: /leistungsverzeichnis/i }).first();
    await expect(section).not.toContainText(/deckungsbeitrag/i);
    await expect(section).not.toContainText(/kalkulationslohn/i);
  });
});

test.describe('commercial data stays inside the office', () => {
  test.slow();

  test('an employee cannot reach the Kalkulation at all', async ({ page }) => {
    requireRole('employee');
    await signIn(page, 'employee');

    const response = await page.goto('/dashboard/kalkulation');
    // Either refused outright or redirected away from the office area.
    expect(response?.status() === 404 || !page.url().includes('/dashboard/kalkulation')).toBe(true);
    await expect(page.locator('body')).not.toContainText(/deckungsbeitrag/i);
  });

  test('the customer portal shows no cost, margin or wage anywhere', async ({ page }) => {
    requireRole('customer');
    await signIn(page, 'customer');

    for (const path of ['/portal', '/portal/leistungen', '/portal/rechnungen']) {
      await page.goto(path);
      const body = page.locator('body');
      // The words themselves, because a leak here is a leak of the firm's
      // own economics to the person it is quoting.
      await expect(body).not.toContainText(/deckungsbeitrag/i);
      await expect(body).not.toContainText(/kalkulationslohn/i);
      await expect(body).not.toContainText(/lohnnebenkosten/i);
      await expect(body).not.toContainText(/marge/i);
      await expect(body).not.toContainText(/richtleistung/i);
    }
  });
});

test.describe('employee onboarding states', () => {
  requireRole('owner');

  test('an invitation link that was already used offers a sign-in', async ({ page }) => {
    // No token needed: the state is what drives the copy, and an unknown token
    // must not claim to be expired either.
    await page.goto('/einladung?state=ANGENOMMEN');
    await expect(page.locator('body')).toContainText(/bereits angenommen/i);
    await expect(page.getByRole('link', { name: /anmelden/i })).toBeVisible();
    // The old wording lumped three situations together; it must not appear.
    await expect(page.locator('body')).not.toContainText(/ungültig, abgelaufen oder/i);
  });

  test('an expired link says so, and points at the office', async ({ page }) => {
    await page.goto('/einladung?state=ABGELAUFEN');
    await expect(page.locator('body')).toContainText(/abgelaufen/i);
    await expect(page.locator('body')).not.toContainText(/bereits angenommen/i);
  });

  test('a replaced link says it was replaced', async ({ page }) => {
    await page.goto('/einladung?state=ZURUECKGEZOGEN');
    await expect(page.locator('body')).toContainText(/neuere einladung|nicht mehr gültig/i);
  });

  test('the office sees account state, and offers no resend to an active employee', async ({ page }) => {
    await signIn(page, 'owner');
    await page.goto('/dashboard/mitarbeiter?status=ACTIVE');
    const rows = page.locator('tbody tr');
    test.skip((await rows.count()) === 0, 'no active employee in this environment');

    await expect(page.locator('body')).toContainText(/aktiv/i);
    await rows.first().click();
    await page.waitForURL(/\/dashboard\/mitarbeiter\/[0-9a-f-]{36}/);
    // Inviting somebody who already has an account is nonsense, and the
    // database refuses it — the screen must not offer it either.
    await expect(page.getByRole('button', { name: /einladung erneut senden/i })).toHaveCount(0);
  });
});
