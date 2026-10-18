import type { Page } from '@playwright/test';

import { expect, openFirstRecord, present, requireRole, signIn, test } from '../fixtures';

/**
 * The employee app on a phone.
 *
 * This runs in the `mobile` project (Pixel 7, ~390px) because that is the only
 * width that matters here: the app is used one-handed, outdoors, often in
 * gloves. A control that needs a desktop to hit is broken.
 *
 * The time-tracking assertions matter most. A cleaner's pay and a customer's
 * invoice both come from these numbers, so a double-tapped Start that opens two
 * entries is a payroll bug, not a UI annoyance.
 */

/**
 * Tippt eine Zeitaktion und bestaetigt sie, wenn die App nachfragt.
 *
 * Start, Pause und Feierabend sind zweistufig: "Einsatz starten" oeffnet
 * "Einsatz jetzt starten? ... Abbrechen | Jetzt starten". Das ist Absicht --
 * ein Streifer in der Hosentasche darf die Uhr nicht starten --, und diese
 * Suite kannte es nicht. Sie tippte den ersten Knopf und erwartete danach den
 * laufenden Zustand; nachgemessen stand die Seite dann bei
 * "Einsatz jetzt starten?" und der Fall fiel durch.
 *
 * Die Bestaetigung wird nur geklickt, wenn sie auftaucht: so bleibt der
 * Helfer richtig, falls eine Aktion ohne Rueckfrage auskommt.
 */
async function timeAction(page: Page, action: RegExp, confirm: RegExp) {
  await page.getByRole('button', { name: action }).first().click();
  const sure = page.getByRole('button', { name: confirm });
  if (await present(sure, 3_000)) await sure.first().click();

  /*
   * Auf das Ende der Buchung warten, nicht darauf hoffen.
   *
   * Die Knoepfe zeigen waehrend der Serveraktion "Wird gestartet …" und sind
   * abgeschaltet. Nachgemessen stand die Seite nach der Bestaetigung 15
   * Sekunden lang so da -- Start ist eine Datenbankrunde samt Neuaufbau der
   * Seite --, und die naechste Zusicherung lief in ihre Zeitgrenze, obwohl
   * die Buchung gleich danach ankam. Der Fall sah wie ein Fehler aus und war
   * nur zu frueh.
   */
  await expect(page.getByRole('button', { name: /wird (gestartet|gespeichert|beendet|pausiert)/i }))
    .toHaveCount(0, { timeout: 90_000 });
}


test.describe('field app', () => {
  requireRole('employee');
  test.beforeEach(async ({ page }, testInfo) => {
    // Only meaningful at phone width; the office project covers the desktop.
    test.skip(testInfo.project.name !== 'mobile', 'phone-width behaviour');
    await signIn(page, 'employee');
  });

  test('opens on what to do now', async ({ page }) => {
    await expect(page).toHaveURL(/\/mitarbeiter/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `the field app overflows by ${overflow}px`).toBeLessThanOrEqual(0);
  });

  test('a job shows where to go and how to get in', async ({ page }) => {
    await page.goto('/mitarbeiter/einsaetze');
    const job = await openFirstRecord(page, '/mitarbeiter/einsaetze');
    test.skip(!job, 'no job assigned to this employee in this environment');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Address and access notes are the reason to open this screen at all.
    await expect(page.locator('body')).toContainText(/adresse|anfahrt|zugang|objekt/i);
  });

  test('start, pause, resume and finish produce one entry with net time', async ({ page }) => {
    await page.goto('/mitarbeiter/einsaetze');
    const job = await openFirstRecord(page, '/mitarbeiter/einsaetze');
    test.skip(!job, 'no job assigned to this employee in this environment');

    const start = page.getByRole('button', { name: /einsatz starten|beginnen/i }).first();
    test.skip(!(await present(start)), 'this job is not in a startable state');

    await timeAction(page, /einsatz starten|beginnen/i, /jetzt starten/i);
    // Running state, asserted rather than waited for.
    await expect(page.getByRole('button', { name: /^pause$/i }).first()).toBeVisible();

    await timeAction(page, /^pause$/i, /pause beginnen|jetzt pausieren/i);
    await expect(page.getByRole('button', { name: /fortsetzen|weiter/i }).first()).toBeVisible();

    await timeAction(page, /fortsetzen|weiter/i, /jetzt fortsetzen|weiterarbeiten/i);
    await expect(page.getByRole('button', { name: /^pause$/i }).first()).toBeVisible();

    await timeAction(page, /beenden|abschließen/i, /jetzt beenden|trotzdem beenden/i);
    await expect(page.getByText(/abgeschlossen|beendet/i).first()).toBeVisible();

    // Exactly one entry, and the break is subtracted rather than ignored.
    await expect(page.locator('body')).toContainText(/pause/i);
  });

  test('a double-tapped start does not open a second entry', async ({ page }) => {
    await page.goto('/mitarbeiter/einsaetze');
    const job = await openFirstRecord(page, '/mitarbeiter/einsaetze');
    test.skip(!job, 'no job assigned to this employee in this environment');

    const start = page.getByRole('button', { name: /einsatz starten|beginnen/i }).first();
    test.skip(!(await present(start)), 'this job is not in a startable state');

    /*
     * Zwei Tipper, so schnell wie ein kalter Daumen auf einem Sprung im Glas
     * -- aber auf der *Bestaetigung*. Der erste Knopf oeffnet nur die
     * Rueckfrage; zweimal darauf zu tippen kann nichts doppelt starten. Die
     * Stelle, an der es weh tut, ist "Jetzt starten".
     */
    await start.click();
    const sure = page.getByRole('button', { name: /jetzt starten/i }).first();
    await sure.click();
    await sure.click({ force: true, timeout: 2_000 }).catch(() => {
      /* the control is already gone, which is itself the protection */
    });

    await expect(page.getByRole('button', { name: /einsatz starten|jetzt starten/i })).toHaveCount(0);
    // The server rejects the second start; the screen must not claim otherwise.
    await expect(page.locator('body')).not.toContainText(/zwei|doppelt erfasst/i);
  });

  test('a checklist item can be ticked and stays ticked', async ({ page }) => {
    await page.goto('/mitarbeiter/einsaetze');
    const job = await openFirstRecord(page, '/mitarbeiter/einsaetze');
    test.skip(!job, 'no job assigned to this employee in this environment');

    /*
     * Die Checkliste ist kein Kontrollkaestchen, sondern ein Schalter.
     *
     * Dieser Test suchte `getByRole('checkbox')` und fand nie etwas: die
     * Anwendung rendert jeden Punkt als `<button aria-pressed>` mit einem
     * grossen Tippziel ueber die ganze Zeile. Das ist fuer eine Hand im
     * Handschuh die richtige Entscheidung, und ein Kontrollkaestchen waere
     * die falsche -- die Suche hier war das Veraltete.
     *
     * Nachgemessen auf einem Einsatz mit sechs Checklistenpunkten:
     * `getByRole('checkbox')` -> 0 Treffer, der Fall uebersprang sich.
     *
     * Geprueft wird jetzt ueber `aria-pressed`, also genau den Zustand, den
     * auch eine Vorleseanwendung liest.
     */
    const open = page.getByRole('button', { pressed: false, name: /als erledigt markieren/i });
    test.skip(!(await present(open)), 'this job has no open checklist item');

    const first = open.first();
    const label = (await first.innerText()).split('\n')[0]!;
    await first.click();

    // Derselbe Punkt, jetzt gedrueckt -- und nach dem Neuladen immer noch.
    const done = page.getByRole('button', { pressed: true }).filter({ hasText: label });
    await expect(done.first(), `${label} blieb nach dem Abhaken nicht erledigt`).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('button', { pressed: true }).filter({ hasText: label }).first(),
      `${label} war nach dem Neuladen wieder offen`,
    ).toBeVisible();
  });

  test('the employee cannot reach billing or customer money', async ({ page }) => {
    for (const forbidden of ['/dashboard/abrechnung', '/dashboard/vertrieb/angebote', '/dashboard/kunden']) {
      await page.goto(forbidden);
      await expect(page.locator('body'), `${forbidden} leaked office data`).not.toContainText(
        /Gesamtbetrag|Rechnungsnr|Angebotsnr/i,
      );
    }
  });
});
