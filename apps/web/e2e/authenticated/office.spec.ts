import { expect, openFirstRecord, recordHrefs, requireRole, signIn, test } from '../fixtures';

/**
 * The office surface, signed in.
 *
 * These need a reachable Supabase project with a seeded OWNER. Point them at a
 * disposable staging project — the suite writes rows — and never at anything
 * holding real customer data:
 *
 *   E2E_BASE_URL=https://staging.example.com \
 *   E2E_OWNER_EMAIL=… E2E_OWNER_PASSWORD=… pnpm test:e2e
 *
 * Without that configuration they skip rather than pass, so a green run never
 * means "the workflow works" when nothing was actually exercised.
 */

test.describe('office, signed in', () => {
  requireRole('owner');
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'owner');
  });

  test('the dashboard opens and shows the shell', async ({ page }) => {
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('navigation').first()).toBeVisible();
  });

  test('every main section opens without an error boundary', async ({ page }) => {
    const sections = [
      '/dashboard/kunden',
      '/dashboard/objekte',
      '/dashboard/mitarbeiter',
      '/dashboard/planung',
      '/dashboard/planung/plaene',
      '/dashboard/auftraege',
      '/dashboard/arbeitszeiten',
      '/dashboard/leistungsnachweise',
      '/dashboard/checklisten',
      '/dashboard/reklamationen',
      '/dashboard/qualitaetskontrolle',
      '/dashboard/abrechnung',
      '/dashboard/vertrieb/anfragen',
      '/dashboard/vertrieb/besichtigungen',
      '/dashboard/vertrieb/angebote',
      '/dashboard/urlaub-krankheit',
      '/dashboard/nachrichten',
      '/dashboard/settings',
    ];
    for (const path of sections) {
      const response = await page.goto(path);
      expect(response?.status(), `${path} returned ${response?.status()}`).toBeLessThan(500);
      /*
        Die eigene Fehlerseite gehoert in diese Liste.

        Gesucht wurde nur nach "Application error" und "Unhandled Runtime
        Error" -- den englischen Zeichenketten von Next.js. Die Anwendung hat
        aber eine eigene Fehlergrenze (app/dashboard/error.tsx), und die sagt
        "Etwas ist schiefgelaufen". Eine kaputte Seite lief damit durch:
        /dashboard/settings zeigte genau diese Fehlerseite, und dieser
        Rundgang hat es nicht gemeldet. Aufgefallen ist es nur daneben, an der
        fehlenden Hauptueberschrift.
      */
      await expect(page.locator('body'), `${path} zeigt eine Fehlerseite`).not.toContainText(
        /Application error|Unhandled Runtime Error|Etwas ist schiefgelaufen|Something went wrong/,
      );
      // Mit Pfad in der Meldung: ein Rundgang ueber achtzehn Seiten, der nur
      // "element(s) not found" sagt, kostet den naechsten Leser einen
      // Trace-Download, um zu erfahren, welche Seite es war.
      await expect(
        page.getByRole('heading', { level: 1 }).first(),
        `${path} hat keine Hauptueberschrift`,
      ).toBeVisible();
    }
  });

  test('a customer can be created and is listed afterwards', async ({ page }) => {
    const name = `E2E Hausverwaltung ${Date.now()}`;
    await page.goto('/dashboard/kunden/neu');
    await page.locator('input[name=name]').fill(name);
    await page.getByRole('button', { name: /kunde anlegen/i }).click();

    await page.waitForURL(/\/dashboard\/kunden/, { timeout: 30_000 });
    await page.goto('/dashboard/kunden');
    await expect(page.getByText(name).first()).toBeVisible();
  });

  /*
   * Der Positionseditor, und warum dieser Test beide Richtungen prueft.
   *
   * Vorher stand hier nur eine Zusicherung: auf einer ausgestellten Rechnung
   * gibt es keinen Knopf "Position hinzufügen". Den gibt es in der Abrechnung
   * aber ueberhaupt nicht -- so heisst er in der Kalkulation. Die Zusicherung
   * war damit auf jeder Seite erfuellt, auch auf einem Entwurf, und der Test
   * konnte nicht fehlschlagen. Ein Test, der nicht fehlschlagen kann, ist
   * schlimmer als keiner: er wird gezaehlt.
   *
   * Darum zuerst der Entwurf. Ist der Editor dort zu finden, weiss die
   * Zusicherung danach, wonach sie sucht.
   */
  test('a draft offers the line editor and an issued invoice does not', async ({ page }) => {
    const editor = /weitere leistung manuell hinzufügen/i;

    await page.goto('/dashboard/abrechnung?status=DRAFT');
    const draft = await openFirstRecord(page, '/dashboard/abrechnung');
    test.skip(!draft, 'no draft invoice in this environment');
    await expect(page.getByText(editor).first(), 'ein Entwurf ohne Positionseditor').toBeVisible();

    /*
     * Die ausgestellte Rechnung wird aus der *ungefilterten* Liste geholt.
     *
     * `?status=ISSUED` waere das Naheliegende und liefert hier nichts: die
     * Liste filtert auf den *angezeigten* Status, und eine ausgestellte
     * Rechnung nach Faelligkeit heisst dort OVERDUE. Der Test uebersprang
     * sich damit stillschweigend -- auf einem Mandanten, der genau die
     * Rechnung hatte, um die es geht.
     */
    await page.goto('/dashboard/abrechnung');
    const others = (await recordHrefs(page, '/dashboard/abrechnung')).filter((href) => href !== draft);
    test.skip(others.length === 0, 'no invoice beyond the draft in this environment');
    await page.goto(others[0]!);

    await expect(page.getByText(editor)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /rechnung ausstellen/i })).toHaveCount(0);
  });

  test('the office surface is usable on a phone', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'checked in the mobile project only');
    await page.goto('/dashboard');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `dashboard overflows by ${overflow}px`).toBeLessThanOrEqual(0);
    await expect(page.getByRole('button', { name: /menü/i })).toBeVisible();
  });
});
