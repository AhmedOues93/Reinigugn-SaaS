import { expect, test as base, type Locator, type Page } from '@playwright/test';

/**
 * Shared machinery for the authenticated suite.
 *
 * Three rules hold everywhere below.
 *
 * **Never production.** These specs write rows. Before anything signs in, the
 * target is checked against the production markers and the run aborts if they
 * match. An E2E suite pointed at production by a mistyped variable is the kind
 * of accident that ends with real invoices in real inboxes.
 *
 * **Deterministic, traceable data.** Every record this suite creates is named
 * with the `E2E` prefix and the run id, so anything it leaves behind is
 * obvious in the UI and safe to remove. Nothing is created with a name a human
 * would plausibly type.
 *
 * **No arbitrary waits.** Playwright's assertions retry; `waitForTimeout` hides
 * races rather than fixing them and is not used anywhere in this suite.
 */

export type Role = 'owner' | 'employee' | 'customer';

const credentials: Record<Role, { email?: string; password?: string }> = {
  owner: { email: process.env.E2E_OWNER_EMAIL, password: process.env.E2E_OWNER_PASSWORD },
  employee: { email: process.env.E2E_EMPLOYEE_EMAIL, password: process.env.E2E_EMPLOYEE_PASSWORD },
  customer: { email: process.env.E2E_CUSTOMER_EMAIL, password: process.env.E2E_CUSTOMER_PASSWORD },
};

export function credentialsFor(role: Role) {
  const pair = credentials[role];
  return pair.email && pair.password ? { email: pair.email, password: pair.password } : null;
}

/** A stable, obviously-synthetic label for anything this run creates. */
export const runId = process.env.E2E_RUN_ID ?? `${Date.now().toString(36)}`;
export const label = (what: string) => `E2E ${what} ${runId}`;

/**
 * Refuses to run against anything that looks like production.
 *
 * Two checks, because each catches what the other misses.
 *
 * The URL check is a denylist and therefore fallible — it was originally
 * written to match only the apex domain and happily let `app.sauberwerk.de`
 * through, which is exactly the address it most needed to stop. It now matches
 * the production domain at any depth.
 *
 * The authoritative check is the second one: the application states which
 * deployment it is on the `html` element, and a target that says `production`
 * is refused whatever its address. That covers a production instance reached
 * through a preview URL, a custom domain nobody added here, or an IP.
 */
const productionHostPatterns = [
  // The production domain, at the apex or on any subdomain.
  /(^|\/\/|\.)sauberwerk\.(de|com)(\/|$|:)/,
  // Conventional markers, as whole words so "staging-prod-alike" is not caught
  // and "prod.example.com" is.
  /(^|\/\/|[.\-/])(prod|production)([.\-/]|$)/,
];

export function assertSafeTarget(baseURL: string | undefined) {
  const target = (baseURL ?? '').toLowerCase();
  if (!target) throw new Error('No baseURL configured for the end-to-end suite.');
  if (process.env.E2E_ALLOW_PRODUCTION === 'i-know-what-i-am-doing') return;

  if (productionHostPatterns.some((pattern) => pattern.test(target))) {
    throw new Error(
      `Refusing to run destructive end-to-end tests against "${baseURL}", which looks like production. ` +
        'Point E2E_BASE_URL at staging.',
    );
  }
}

/**
 * Asks the target what it is. Authoritative where the address is not.
 * A target that cannot be reached is not a refusal — the specs will fail on
 * their own, with a better message than this could give.
 */
export async function assertTargetIsNotProduction(baseURL: string | undefined) {
  if (process.env.E2E_ALLOW_PRODUCTION === 'i-know-what-i-am-doing') return;
  if (!baseURL) return;

  let html: string;
  try {
    const response = await fetch(new URL('/login', baseURL), { redirect: 'follow' });
    html = await response.text();
  } catch {
    return;
  }
  if (/data-app-env=["']production["']/.test(html)) {
    throw new Error(
      `Refusing to run destructive end-to-end tests against "${baseURL}": it reports itself as a ` +
        'production deployment (data-app-env="production").',
    );
  }
}

/** Signs in and lands on whichever surface the role belongs to. */
export async function signIn(page: Page, role: Role) {
  const pair = credentialsFor(role);
  if (!pair) throw new Error(`No credentials configured for role "${role}".`);

  await page.goto('/login');
  await page.locator('input[type=email]').fill(pair.email);
  await page.locator('input[name=password]').fill(pair.password);
  await page.getByRole('button', { name: /anmelden/i }).click();
  // Each role lands somewhere different; waiting for any of them keeps this
  // helper usable for the routing assertions too.
  await page.waitForURL(/\/(dashboard|mitarbeiter|portal)/, { timeout: 30_000 });
}

/** Confirms the app is not reporting itself as a production deployment. */
export async function assertNotProductionApp(page: Page) {
  const environment = await page.evaluate(() => document.documentElement.dataset.appEnv ?? null);
  expect(environment, 'the target reports itself as production').not.toBe('production');
}

/**
 * The suite's own `test`, which skips cleanly when a role has no credentials
 * and refuses a production target before the first navigation.
 */
export const test = base.extend<{ safeTarget: void }>({
  safeTarget: [
    async ({ baseURL }, use) => {
      assertSafeTarget(baseURL);
      await assertTargetIsNotProduction(baseURL);
      await use();
    },
    { auto: true },
  ],
});

export function requireRole(role: Role) {
  test.skip(
    !credentialsFor(role),
    `No credentials for "${role}" (set E2E_${role.toUpperCase()}_EMAIL / _PASSWORD) — skipping rather than passing vacuously.`,
  );
}

/**
 * Links auf eine Detailseite unter `prefix` -- und nur die.
 *
 * `page.locator('a[href*="/dashboard/abrechnung/"]')` sieht richtig aus und
 * ist es nicht: unter demselben Pfad liegen auch Seiten, die keine Rechnung
 * sind. Nachgemessen in CI, nachdem der Monatslauf hinzukam:
 *
 *     page.waitForURL: Test timeout of 135000ms exceeded.
 *       navigated to ".../dashboard/abrechnung/monatslauf"
 *
 * Der Test klickte den ersten Treffer, landete auf dem Monatslauf und wartete
 * bis zum Zeitablauf auf eine Kennung in der Adresse. Vier Faelle in
 * billing.spec.ts hingen daran, und dieselbe Form stand an 26 Stellen --
 * jede neue Unterseite haette weitere getroffen.
 *
 * Darum wird hier nach der *Form* der Adresse gefiltert und nicht nach dem,
 * was gerade nicht darunter liegt: ein Link zaehlt, wenn sein letztes Segment
 * eine UUID ist. Eine Ausschlussliste waere beim naechsten Feature wieder
 * falsch.
 *
 * Zurueck kommt ein echter Locator, damit `count()`, `filter()` und `first()`
 * weiter gehen. Er ist allerdings eine Momentaufnahme: die Adressen werden
 * einmal gelesen. Darum wird vorher auf den ersten Link gewartet -- ohne das
 * waere bei spaet gerendertem Inhalt nichts da. Bleibt es leer, ist das keine
 * Ausnahme, sondern die Antwort "hier gibt es keine Detailseite", und der
 * Aufrufer ueberspringt wie bisher.
 */
const detailSegment = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:[/?#]|$)/i;

export async function detailLinks(page: Page, prefix: string): Promise<Locator> {
  const anyLink = page.locator(`a[href*="${prefix}"]`);
  // Ein leerer Bestand ist ein erwartetes Ergebnis, kein Fehlschlag.
  await anyLink.first().waitFor({ state: 'attached', timeout: 10_000 }).catch(() => undefined);

  const hrefs = [
    ...new Set(
      (await anyLink.evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? '')))
        .filter((href) => detailSegment.test(href)),
    ),
  ];

  // Ein Locator, der nichts trifft, damit `count()` 0 ergibt statt zu werfen.
  if (hrefs.length === 0) return page.locator('a[data-e2e-detail-link-absent]');
  return page.locator(hrefs.map((href) => `a[href="${href}"]`).join(', '));
}

/**
 * Oeffnet die erste Detailseite unter `prefix` und gibt deren Adresse zurueck,
 * oder null, wenn es keine gibt.
 */
export async function openFirstDetail(page: Page, prefix: string): Promise<string | null> {
  const links = await detailLinks(page, prefix);
  if ((await links.count()) === 0) return null;
  const href = await links.first().getAttribute('href');
  await links.first().click();
  return href;
}

export { expect };
