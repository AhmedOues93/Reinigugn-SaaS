import { test, expect } from '@playwright/test';

test.describe('configured CAPTCHA', () => {
  test.skip(!process.env.E2E_CAPTCHA_SITE_KEY, 'Requires the optional CAPTCHA test configuration');

  test.beforeEach(async ({ page }) => {
    // Exercise the widget lifecycle without contacting Cloudflare or Auth.
    await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js*', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `window.turnstile = {
        render(element, options) {
          element.textContent = 'Sicherheitsprüfung';
          options.callback('test-single-use-token');
          window.addEventListener('test-captcha-expired', options['expired-callback']);
          window.addEventListener('test-captcha-error', options['error-callback']);
          return 'test-widget';
        },
        remove() {}, reset() {}
      };`,
      }),
    );
  });

  test('login forwards a token and clears an expired token', async ({ page }) => {
    await page.goto('/admin/login');
    const token = page.locator('input[name="captcha_token"]');
    await expect(token).toHaveValue('test-single-use-token');
    await page.evaluate(() => window.dispatchEvent(new Event('test-captcha-expired')));
    await expect(token).toHaveValue('');
  });

  test('signup displays a usable error when the widget fails', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.locator('input[name="captcha_token"]')).toHaveValue('test-single-use-token');
    await page.evaluate(() => window.dispatchEvent(new Event('test-captcha-error')));
    await expect(
      page.getByRole('alert').filter({ hasText: 'Sicherheitsprüfung konnte nicht geladen' }),
    ).toBeVisible();
    await expect(page.locator('input[name="captcha_token"]')).toHaveValue('');
  });

  test('password reset includes the same challenge', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.locator('input[name="captcha_token"]')).toHaveValue('test-single-use-token');
  });
});
