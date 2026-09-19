import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The guard is the only thing standing between a staging deployment and a real
 * customer's inbox, so it is tested per environment rather than read.
 */
async function decide(env: Record<string, string | undefined>, to: string, subject = 'Rechnung RE-2026-0001') {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const { decideRecipient } = await import('@/lib/mail/guard');
  return decideRecipient(to, subject);
}

const clean = {
  NEXT_PUBLIC_APP_ENV: undefined,
  MAIL_ALLOWED_RECIPIENTS: undefined,
  MAIL_CATCH_ALL: undefined,
};

afterEach(() => {
  for (const key of Object.keys(clean)) delete process.env[key];
});

describe('outbound mail guard', () => {
  it('sends production mail untouched', async () => {
    const decision = await decide({ ...clean, NEXT_PUBLIC_APP_ENV: 'production' }, 'kunde@hausverwaltung.de');
    expect(decision).toEqual({
      action: 'send',
      to: 'kunde@hausverwaltung.de',
      subject: 'Rechnung RE-2026-0001',
      notice: null,
    });
  });

  it('lets local development through, but names the environment', async () => {
    // Mailpit accepts every address and nothing leaves the machine.
    const decision = await decide({ ...clean, NEXT_PUBLIC_APP_ENV: 'local' }, 'kunde@hausverwaltung.de');
    expect(decision.action).toBe('send');
    if (decision.action !== 'send') return;
    expect(decision.to).toBe('kunde@hausverwaltung.de');
    expect(decision.subject).toBe('[LOKAL] Rechnung RE-2026-0001');
  });

  it('treats an unset environment as local, never as production', async () => {
    const decision = await decide({ ...clean }, 'kunde@hausverwaltung.de');
    expect(decision.action).toBe('send');
    if (decision.action !== 'send') return;
    expect(decision.subject).toContain('[LOKAL]');
  });

  it('refuses to mail a real customer from staging when nothing safe is configured', async () => {
    const decision = await decide({ ...clean, NEXT_PUBLIC_APP_ENV: 'staging' }, 'kunde@hausverwaltung.de');
    expect(decision.action).toBe('block');
    if (decision.action !== 'block') return;
    expect(decision.reason).toContain('kunde@hausverwaltung.de');
  });

  it('redirects staging mail to the catch-all and keeps the real recipient visible', async () => {
    const decision = await decide(
      { ...clean, NEXT_PUBLIC_APP_ENV: 'staging', MAIL_CATCH_ALL: 'qa@sauberwerk.test' },
      'kunde@hausverwaltung.de',
    );
    expect(decision.action).toBe('send');
    if (decision.action !== 'send') return;
    expect(decision.to).toBe('qa@sauberwerk.test');
    expect(decision.subject).toContain('kunde@hausverwaltung.de');
    expect(decision.notice).toContain('kunde@hausverwaltung.de');
  });

  it('delivers to an explicitly allowed address unchanged', async () => {
    const decision = await decide(
      { ...clean, NEXT_PUBLIC_APP_ENV: 'staging', MAIL_ALLOWED_RECIPIENTS: 'qa@sauberwerk.test' },
      'qa@sauberwerk.test',
    );
    expect(decision.action).toBe('send');
    if (decision.action !== 'send') return;
    expect(decision.to).toBe('qa@sauberwerk.test');
  });

  it('allows a whole domain and still stops everyone else', async () => {
    const env = { ...clean, NEXT_PUBLIC_APP_ENV: 'staging', MAIL_ALLOWED_RECIPIENTS: '@sauberwerk.test' };
    expect((await decide(env, 'anyone@sauberwerk.test')).action).toBe('send');
    expect((await decide(env, 'kunde@hausverwaltung.de')).action).toBe('block');
  });

  it('is not fooled by casing or a lookalike domain suffix', async () => {
    const env = { ...clean, NEXT_PUBLIC_APP_ENV: 'staging', MAIL_ALLOWED_RECIPIENTS: '@sauberwerk.test' };
    expect((await decide(env, 'QA@Sauberwerk.TEST')).action).toBe('send');
    // Ends with "sauberwerk.test" as a string, but is a different domain.
    expect((await decide(env, 'kunde@notsauberwerk.test')).action).toBe('block');
  });
});
