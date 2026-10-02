import { describe, expect, it } from 'vitest';
import { assertSafeTarget } from '../e2e/fixtures';

/**
 * The end-to-end suite writes rows, so the check that keeps it off production
 * is itself worth testing — the first version matched only the apex domain and
 * waved `app.sauberwerk.de` straight through, which was the exact address it
 * existed to stop.
 */
const refused = (url: string) => expect(() => assertSafeTarget(url), url).toThrow(/Refusing/);
const allowed = (url: string) => expect(() => assertSafeTarget(url), url).not.toThrow();

describe('end-to-end target guard', () => {
  it('refuses the production domain at any depth', () => {
    refused('https://sauberwerk.de');
    refused('https://www.sauberwerk.de');
    refused('https://app.sauberwerk.de');
    refused('https://app.sauberwerk.de/');
    refused('https://kunde.app.sauberwerk.com');
    refused('https://app.sauberwerk.de:8443');
  });

  it('refuses conventional production markers', () => {
    refused('https://prod.example.com');
    refused('https://example.com/production');
    refused('https://my-prod-host.example.com');
  });

  it('allows staging and local targets', () => {
    allowed('http://127.0.0.1:3100');
    allowed('http://localhost:3000');
    allowed('https://staging.sauberwerk-test.de');
    allowed('https://sauberwerk-staging.vercel.app');
    allowed('https://pr-42.onrender.com');
  });

  it('is not fooled by a lookalike domain', () => {
    // A different company that happens to end similarly must not be treated as
    // ours — and must not be silently allowed either way by a sloppy match.
    allowed('https://staging.nichtsauberwerk.de');
  });

  it('refuses when no target is configured at all', () => {
    expect(() => assertSafeTarget(undefined)).toThrow(/No baseURL/);
    expect(() => assertSafeTarget('')).toThrow(/No baseURL/);
  });

  it('can be overridden deliberately, and only with the exact phrase', () => {
    process.env.E2E_ALLOW_PRODUCTION = 'yes';
    refused('https://app.sauberwerk.de');
    process.env.E2E_ALLOW_PRODUCTION = 'i-know-what-i-am-doing';
    allowed('https://app.sauberwerk.de');
    delete process.env.E2E_ALLOW_PRODUCTION;
  });
});
