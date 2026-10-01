import { describe, expect, it } from 'vitest';
import {
  LOGIN_THROTTLE,
  PASSWORD_RESET_THROTTLE,
  clientAddress,
  throttleMessage,
} from '@/lib/auth-throttle';
import {
  MFA_CHALLENGE_PATH,
  MFA_SETTINGS_PATH,
  mfaDecision,
  mfaRedirect,
  normalizeTotpCode,
} from '@/lib/mfa';

function headers(values: Record<string, string>) {
  return (name: string) => values[name] ?? null;
}

describe('clientAddress', () => {
  it('bevorzugt die von der Plattform gesetzte Kopfzeile', () => {
    expect(
      clientAddress(headers({
        'x-vercel-forwarded-for': '198.51.100.7',
        'x-forwarded-for': '10.0.0.1',
      })),
    ).toBe('198.51.100.7');
  });

  it('nimmt aus einer Kette den ersten Eintrag', () => {
    expect(clientAddress(headers({ 'x-forwarded-for': '198.51.100.7, 10.0.0.1, 10.0.0.2' })))
      .toBe('198.51.100.7');
  });

  it('gibt null, wenn keine Adresse mitkommt -- dann wird nicht gebremst', () => {
    expect(clientAddress(headers({}))).toBeNull();
    expect(clientAddress(headers({ 'x-forwarded-for': '   ' }))).toBeNull();
  });

  it('kuerzt, damit der Schluessel in die Spalte passt', () => {
    expect(clientAddress(headers({ 'x-real-ip': 'a'.repeat(400) }))).toHaveLength(100);
  });
});

describe('throttleMessage', () => {
  it('sagt eine Minute, solange es nicht mehr ist', () => {
    expect(throttleMessage(12)).toContain('einer Minute');
    expect(throttleMessage(60)).toContain('einer Minute');
  });

  it('rundet auf ganze Minuten auf', () => {
    expect(throttleMessage(61)).toContain('2 Minuten');
    expect(throttleMessage(600)).toContain('10 Minuten');
  });

  it('verraet nicht, ob das Konto existiert', () => {
    const message = throttleMessage(600);
    expect(message).not.toMatch(/konto|benutzer|e-mail-adresse/i);
  });
});

describe('die Grenzen', () => {
  it('lassen jemandem, der sein Passwort sucht, genug Versuche', () => {
    expect(LOGIN_THROTTLE.limit).toBeGreaterThanOrEqual(5);
    expect(LOGIN_THROTTLE.windowSeconds).toBeGreaterThanOrEqual(300);
  });

  it('haben getrennte Zaehler, damit eine Passwort-Mail die Anmeldung nicht sperrt', () => {
    expect(PASSWORD_RESET_THROTTLE.scope).not.toBe(LOGIN_THROTTLE.scope);
  });
});

describe('mfaDecision', () => {
  it('laesst durch, wenn nichts eingerichtet und nichts verlangt ist', () => {
    expect(mfaDecision({ currentLevel: 'aal1', nextLevel: 'aal1', required: false })).toBe('ok');
  });

  it('verlangt die Bestaetigung, sobald ein Faktor existiert -- auch freiwillig', () => {
    expect(mfaDecision({ currentLevel: 'aal1', nextLevel: 'aal2', required: false })).toBe('verify');
    expect(mfaDecision({ currentLevel: 'aal1', nextLevel: 'aal2', required: true })).toBe('verify');
  });

  it('laesst eine bestaetigte Sitzung in Ruhe', () => {
    expect(mfaDecision({ currentLevel: 'aal2', nextLevel: 'aal2', required: true })).toBe('ok');
  });

  it('schickt zum Einrichten, wenn der Betrieb es verlangt', () => {
    expect(mfaDecision({ currentLevel: 'aal1', nextLevel: 'aal1', required: true })).toBe('enroll');
  });

  it('entscheidet auch ohne Angaben etwas Harmloses', () => {
    expect(mfaDecision({ currentLevel: null, nextLevel: null, required: false })).toBe('ok');
    expect(mfaDecision({ currentLevel: null, nextLevel: null, required: true })).toBe('enroll');
  });
});

describe('mfaRedirect', () => {
  it('schickt zur Bestaetigung und zur Einrichtung', () => {
    expect(mfaRedirect('verify', '/dashboard')).toBe(MFA_CHALLENGE_PATH);
    expect(mfaRedirect('enroll', '/dashboard')).toBe(`${MFA_SETTINGS_PATH}?einrichten=1`);
  });

  it('leitet die Sicherheitsseiten nicht auf sich selbst um', () => {
    expect(mfaRedirect('verify', MFA_CHALLENGE_PATH)).toBeNull();
    expect(mfaRedirect('enroll', MFA_SETTINGS_PATH)).toBeNull();
    expect(mfaRedirect('verify', MFA_SETTINGS_PATH)).toBeNull();
  });

  it('riegelt auch ohne bekannten Pfad ab', () => {
    expect(mfaRedirect('enroll', null)).toBe(`${MFA_SETTINGS_PATH}?einrichten=1`);
  });

  it('leitet nie um, wenn alles in Ordnung ist', () => {
    expect(mfaRedirect('ok', '/dashboard')).toBeNull();
  });
});

describe('normalizeTotpCode', () => {
  it('nimmt sechs Ziffern, auch mit Leerzeichen aus der App', () => {
    expect(normalizeTotpCode('123 456')).toBe('123456');
    expect(normalizeTotpCode('123-456')).toBe('123456');
  });

  it('weist alles andere ab', () => {
    for (const bad of ['12345', '1234567', 'abcdef', '', null, undefined, '12 34 5a']) {
      expect(normalizeTotpCode(bad)).toBeNull();
    }
  });
});
