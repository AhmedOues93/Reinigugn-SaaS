import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mailSetupStatus } from '../lib/mail/transport';

/*
 * "E-Mail-Versand nicht verbunden" allein war nicht handlungsfaehig: wer den
 * Anbieter setzt und den Absender vergisst, sah dieselbe Meldung wie jemand,
 * der gar nichts gesetzt hat. Diese Tests halten fest, dass jeder fehlende
 * Baustein einzeln benannt wird -- und dass nie ein Wert nach aussen geht.
 */
const KEYS = ['RESEND_API_KEY', 'SMTP_HOST', 'MAIL_FROM'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

const byVariable = (variable: string) =>
  mailSetupStatus().steps.find((step) => step.variable === variable);

describe('mailSetupStatus', () => {
  it('meldet ohne jede Konfiguration beide Bausteine als offen', () => {
    const status = mailSetupStatus();
    expect(status.configured).toBe(false);
    expect(status.steps.every((step) => !step.present)).toBe(true);
    expect(byVariable('RESEND_API_KEY')?.hint).toContain('RESEND_API_KEY');
    expect(byVariable('MAIL_FROM')?.present).toBe(false);
  });

  it('benennt den fehlenden Absender, wenn nur der Anbieter gesetzt ist', () => {
    process.env.RESEND_API_KEY = 're_secret_value';
    const status = mailSetupStatus();
    expect(status.configured).toBe(false);
    expect(byVariable('RESEND_API_KEY')?.present).toBe(true);
    expect(byVariable('MAIL_FROM')?.present).toBe(false);
  });

  it('benennt den fehlenden Anbieter, wenn nur der Absender gesetzt ist', () => {
    process.env.MAIL_FROM = 'Firma <rechnung@example.de>';
    const status = mailSetupStatus();
    expect(status.configured).toBe(false);
    expect(byVariable('MAIL_FROM')?.present).toBe(true);
    expect(byVariable('RESEND_API_KEY')?.present).toBe(false);
  });

  it('nennt SMTP_HOST, wenn der Betrieb einen eigenen Relay statt Resend nutzt', () => {
    process.env.SMTP_HOST = 'mail.firma.de';
    process.env.MAIL_FROM = 'Firma <rechnung@example.de>';
    const status = mailSetupStatus();
    expect(status.configured).toBe(true);
    expect(byVariable('SMTP_HOST')?.present).toBe(true);
  });

  it('ist erst vollstaendig, wenn Anbieter und Absender da sind', () => {
    process.env.RESEND_API_KEY = 're_secret_value';
    process.env.MAIL_FROM = 'Firma <rechnung@example.de>';
    expect(mailSetupStatus().configured).toBe(true);
  });

  it('gibt niemals einen Wert heraus, nur Namen und ja/nein', () => {
    process.env.RESEND_API_KEY = 're_super_secret_key';
    process.env.MAIL_FROM = 'Firma <rechnung@example.de>';
    const serialized = JSON.stringify(mailSetupStatus());
    expect(serialized).not.toContain('re_super_secret_key');
    expect(serialized).not.toContain('rechnung@example.de');
  });

  it('behandelt ein leeres Feld wie nicht gesetzt, statt es als erledigt zu zeigen', () => {
    process.env.RESEND_API_KEY = '   ';
    process.env.MAIL_FROM = '';
    const status = mailSetupStatus();
    expect(status.configured).toBe(false);
    expect(status.steps.every((step) => !step.present)).toBe(true);
  });
});
