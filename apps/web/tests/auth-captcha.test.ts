import { afterEach, describe, expect, it, vi } from 'vitest';
import { captchaOptions, captchaRequired } from '@/lib/auth-captcha';

afterEach(() => vi.unstubAllEnvs());

describe('Supabase CAPTCHA options', () => {
  it('preserves unconfigured auth and never invents a token', () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');
    expect(captchaOptions(new FormData())).toEqual({});
    expect(captchaRequired(new FormData())).toBe(false);
  });
  it('requires a token on the server when a site key is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key');
    expect(captchaRequired(new FormData())).toBe(true);
    const data = new FormData();
    data.set('captcha_token', ' verified-by-supabase ');
    expect(captchaOptions(data)).toEqual({ captchaToken: 'verified-by-supabase' });
    expect(captchaRequired(data)).toBe(false);
  });
  it('rejects files and oversized tokens', () => {
    const data = new FormData();
    data.set('captcha_token', new Blob(['not a token']), 'file');
    expect(captchaOptions(data)).toEqual({});
    data.set('captcha_token', 'x'.repeat(4097));
    expect(captchaOptions(data)).toEqual({});
  });
});
