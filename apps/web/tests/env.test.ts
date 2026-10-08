import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Configuration mistakes are deployment mistakes, and the expensive ones are
 * silent: an invitation link pointing at localhost still "works" for whoever
 * generated it. These check that the module refuses instead.
 */
async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return import('@/lib/env');
}

const keys = [
  'NEXT_PUBLIC_APP_ENV',
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'URL',
  'RENDER_EXTERNAL_URL',
];
const blank = Object.fromEntries(keys.map((key) => [key, undefined]));

afterEach(() => {
  for (const key of keys) delete process.env[key];
});

describe('environment', () => {
  it('treats an unset or unknown environment as local', async () => {
    expect((await load({ ...blank })).appEnvironment()).toBe('local');
    expect((await load({ ...blank, NEXT_PUBLIC_APP_ENV: 'prod' })).appEnvironment()).toBe('local');
    expect((await load({ ...blank, NEXT_PUBLIC_APP_ENV: '' })).appEnvironment()).toBe('local');
  });

  it('recognises the three real environments', async () => {
    for (const value of ['local', 'staging', 'production'] as const) {
      expect((await load({ ...blank, NEXT_PUBLIC_APP_ENV: value })).appEnvironment()).toBe(value);
    }
    expect((await load({ ...blank, NEXT_PUBLIC_APP_ENV: 'production' })).isProduction()).toBe(true);
    expect((await load({ ...blank, NEXT_PUBLIC_APP_ENV: 'staging' })).isProduction()).toBe(false);
  });

  it('names the variable that is missing', async () => {
    const env = await load({ ...blank });
    expect(() => env.supabaseUrl()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(() => env.supabasePublishableKey()).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });

  it('falls back to localhost only in local development', async () => {
    const local = await load({ ...blank, NEXT_PUBLIC_APP_ENV: 'local' });
    expect(local.siteUrl()).toBe('http://localhost:3000');
  });

  it('refuses to guess a site URL for a deployed environment', async () => {
    // Otherwise staging mails people a link to their own machine.
    for (const value of ['staging', 'production'] as const) {
      const env = await load({ ...blank, NEXT_PUBLIC_APP_ENV: value });
      expect(() => env.siteUrl()).toThrow(/NEXT_PUBLIC_SITE_URL/);
    }
  });

  it('normalises a trailing slash so links never double up', async () => {
    const env = await load({
      ...blank,
      NEXT_PUBLIC_APP_ENV: 'staging',
      NEXT_PUBLIC_SITE_URL: 'https://staging.example.com///',
    });
    expect(env.siteUrl()).toBe('https://staging.example.com');
    expect(new URL('/auth/callback', env.siteUrl()).toString()).toBe(
      'https://staging.example.com/auth/callback',
    );
  });

  it('repairs missing and loopback origins on Render and Netlify', async () => {
    for (const host of ['URL', 'RENDER_EXTERNAL_URL']) {
      for (const configured of [undefined, 'http://localhost:3000', 'http://[::1]:3000', 'http://app.localhost:3000']) {
        const env = await load({ ...blank, [host]: 'https://reinplan.example.com/', NEXT_PUBLIC_SITE_URL: configured });
        expect(env.siteUrl()).toBe('https://reinplan.example.com');
      }
    }
  });

  it('keeps an explicitly configured custom domain', async () => {
    const env = await load({ ...blank, RENDER_EXTERNAL_URL: 'https://reinplan.onrender.com', NEXT_PUBLIC_SITE_URL: 'https://app.reinplan.de' });
    expect(env.siteUrl()).toBe('https://app.reinplan.de');
  });

  it('rejects unsafe or malformed deployment origins', async () => {
    for (const value of ['http://localhost:3000', 'http://[::1]:3000', 'http://example.com', 'javascript:alert(1)', 'not-a-url', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com?token=secret', 'https://example.com#fragment']) {
      const env = await load({ ...blank, NEXT_PUBLIC_APP_ENV: 'production', NEXT_PUBLIC_SITE_URL: value });
      expect(() => env.siteUrl()).toThrow(/NEXT_PUBLIC_SITE_URL/);
    }
  });
});
