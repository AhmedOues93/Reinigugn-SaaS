import { expect, test } from '@playwright/test';

/**
 * Everything reachable without signing in.
 *
 * These specs need no backend, so they run in CI on every push and are the
 * suite's early-warning system: a broken build, a client bundle missing its
 * configuration, a form that no longer validates, or a layout that overflows a
 * phone all surface here within a minute.
 */

/** The form's own validation messages, excluding Next.js's route announcer. */
function fieldError(page: import('@playwright/test').Page) {
  return page.locator('p[role=alert]');
}

test.describe('unauthenticated surface', () => {
  test('the root serves the landing page to a signed-out visitor', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // The page exists to get people into the product, so the way in is the
    // assertion that matters.
    await expect(page.getByRole('link', { name: /anmelden/i }).first()).toBeVisible();
  });

  test('the landing page leads to the sign-in form', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /anmelden/i }).first().click();
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('input[type=email]')).toBeVisible();
    await expect(page.locator('input[type=password]')).toBeVisible();
  });

  test('a protected area is never served to an anonymous visitor', async ({ page }) => {
    // The real assertion: no dashboard content, whatever the route does.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('the sign-in form rejects a malformed address before contacting the server', async ({ page }) => {
    await page.goto('/admin/login');
    const address = page.locator('input[type=email]');
    await address.fill('keine-adresse');
    // Validation runs when the field is left, which is what Tab does. Clicking
    // the next field can land on the reveal button that overlays it.
    await address.press('Tab');
    // Scoped deliberately: Next.js keeps an empty role="alert" route announcer
    // in the document, so an unfiltered alert lookup is ambiguous.
    await expect(fieldError(page)).toContainText(/E-Mail/i);
    await expect(address).toHaveAttribute('aria-invalid', 'true');
  });

  test('an empty submission does not navigate away', async ({ page }) => {
    await page.goto('/admin/login');
    await page.getByRole('button', { name: /anmelden/i }).click();
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(fieldError(page).first()).toBeVisible();
    await expect(page.locator('input[type=email]')).toHaveAttribute('aria-invalid', 'true');
  });

  test('the password can be revealed and hidden again', async ({ page }) => {
    await page.goto('/admin/login');
    const password = page.locator('input[name=password]');
    await password.fill('ein-geheimes-passwort');
    await expect(password).toHaveAttribute('type', 'password');

    const toggle = page.locator('button[aria-pressed]');
    await toggle.click();
    await expect(page.locator('input[name=password]')).toHaveAttribute('type', 'text');
    await toggle.click();
    await expect(page.locator('input[name=password]')).toHaveAttribute('type', 'password');
  });

  test('sign-up and password reset are reachable and come back', async ({ page }) => {
    await page.goto('/admin/login');
    await page.getByRole('link', { name: /passwort vergessen/i }).click();
    await expect(page).toHaveURL(/\/forgot-password/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page.goto('/signup');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('input[type=email]')).toBeVisible();
  });

  for (const path of ['/', '/admin/login', '/mitarbeiter/login', '/kunde/login', '/signup', '/forgot-password', '/impressum', '/datenschutz', '/agb']) {
    test(`${path} does not scroll sideways`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('body')).toBeVisible();
      const metrics = await page.locator('body').evaluate((body) => ({
        bodyWidth: body.scrollWidth,
        rootWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      }), { timeout: 5_000 });
      const overflow = Math.max(metrics.bodyWidth, metrics.rootWidth) - metrics.viewportWidth;
      expect(overflow, `${path} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(0);
    });
  }

  test('every visible control can be reached and seen when tabbing', async ({ page }) => {
    await page.goto('/admin/login');
    await expect(page.locator('input[type=email]')).toBeVisible();
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    const reached: string[] = [];
    for (let step = 0; step < 6; step += 1) {
      await page.keyboard.press('Tab');
      reached.push(
        await page.evaluate(() => {
          const element = document.activeElement as HTMLElement | null;
          if (!element || element === document.body) return 'body';
          const style = getComputedStyle(element);
          const visible = style.outlineStyle !== 'none' || style.boxShadow !== 'none';
          return `${element.tagName.toLowerCase()}${visible ? '' : ':no-focus-ring'}`;
        }),
      );
    }
    expect(reached).toContain('input');
    expect(reached).toContain('button');
    expect(reached.join(' ')).not.toContain(':no-focus-ring');
  });

  test('both apps are installable, each with its own tile', async ({ page, request }) => {
    await page.goto('/admin/login');

    const surfaces = [
      { path: '/mitarbeiter/manifest.webmanifest', scope: '/mitarbeiter' },
      { path: '/dashboard/manifest.webmanifest', scope: '/dashboard' },
    ];
    const tiles: string[] = [];

    for (const surface of surfaces) {
      const manifest = await request.get(surface.path);
      expect(manifest.status(), `${surface.path} is not served`).toBe(200);
      const body = await manifest.json();
      expect(body.name ?? body.short_name).toBeTruthy();
      expect(body.scope, `${surface.path} must own its own scope`).toBe(surface.scope);

      // Chrome only offers to install when the manifest carries a square PNG of
      // at least 192px. A manifest of SVG alone passes a naive "has icons"
      // check and still installs as a blank tile, which is the bug this guards.
      const icons: { src: string; sizes?: string; type?: string; purpose?: string }[] = body.icons ?? [];
      const square = icons.filter(
        (icon) => icon.type === 'image/png' && Number((icon.sizes ?? '0x0').split('x')[0]) >= 192,
      );
      expect(square.length, `${surface.path} has no PNG of at least 192px`).toBeGreaterThan(0);
      expect(
        icons.some((icon) => icon.purpose === 'maskable'),
        `${surface.path} has no maskable icon`,
      ).toBe(true);

      // Every icon it promises must actually be served.
      for (const icon of icons) {
        const asset = await request.get(icon.src);
        expect(asset.status(), `${icon.src} is missing`).toBe(200);
      }

      tiles.push(icons.map((icon) => icon.src).join('|'));
    }

    // The two apps must not share a tile, or a home screen shows the same icon
    // twice and neither opens what its owner expects.
    expect(tiles[0]).not.toBe(tiles[1]);
  });
});
