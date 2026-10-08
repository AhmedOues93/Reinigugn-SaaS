/**
 * Nicht zum Behalten. Eine Sonde, keine Zusicherung.
 *
 * Vier Tests warten 45 Sekunden auf `getByRole('button', { name: /kunde
 * anlegen/i })` und finden ihn nicht, obwohl die Seite ihn an
 * `<CustomerForm submitLabel="Kunde anlegen">` uebergibt. Zwei Vermutungen
 * habe ich lokal geprueft und beide waren falsch: die Feldnamen stimmen, und
 * der Zwei-Faktor-Riegel haengt an `require_staff_mfa`, das der Seed nicht
 * setzt.
 *
 * Also wird nicht weiter geraten, sondern nachgesehen: wo landet das
 * Inhaber-Konto wirklich, und was steht dort. Die Sonde behauptet nichts, sie
 * gibt aus.
 */
import { expect, requireRole, signIn, test } from '../fixtures';

test.describe('probe', () => {
  requireRole('owner');

  test('wo landet das Inhaber-Konto und was steht dort', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'einmal reicht');
    await signIn(page, 'owner');

    for (const target of [
      '/dashboard',
      '/dashboard/kunden/neu',
      '/dashboard/kunden',
      '/dashboard/kalkulation/grundlagen',
    ]) {
      await page.goto(target);
      // Erst wenn das Netz ruhig ist, steht auch eine Weiterleitung fest.
      await page.waitForLoadState('networkidle').catch(() => undefined);

      const seen = await page.evaluate(() => ({
        url: location.pathname + location.search,
        title: document.querySelector('h1')?.textContent?.trim() ?? '(kein h1)',
        buttons: [...document.querySelectorAll('button')]
          .map((b) => (b.textContent ?? '').replace(/\s+/g, ' ').trim())
          .filter(Boolean),
        inputs: [...document.querySelectorAll('input[name], select[name], textarea[name]')].map((i) =>
          i.getAttribute('name'),
        ),
        // Die ersten Zeilen Text sagen, ob hier eine Sperre oder ein Assistent steht.
        text: (document.body.innerText ?? '').replace(/\s+/g, ' ').slice(0, 400),
      }));

      console.log(`\n=== angefordert: ${target}`);
      console.log(`    gelandet:   ${seen.url}`);
      console.log(`    h1:         ${seen.title}`);
      console.log(`    buttons:    ${JSON.stringify(seen.buttons)}`);
      console.log(`    inputs:     ${JSON.stringify(seen.inputs)}`);
      console.log(`    text:       ${seen.text}`);
    }

    // Die Sonde soll gruen durchlaufen, damit der Lauf die Ausgabe nicht
    // hinter einem Fehlschlag versteckt.
    expect(true).toBe(true);
  });
});
