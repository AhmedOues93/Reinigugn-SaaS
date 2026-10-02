import { describe, expect, it } from 'vitest';
import {
  type AuditEvent,
  actionLabel,
  auditDetailText,
  auditHref,
  isSensitiveAction,
} from '@/lib/audit';

function event(partial: Partial<AuditEvent>): AuditEvent {
  return {
    occurredAt: '2026-03-01T09:00:00Z',
    action: 'INVOICE_ISSUED',
    actorName: 'Ayse Yilmaz',
    subjectType: 'invoice',
    subjectId: '11111111-1111-4111-8111-111111111111',
    subjectLabel: 'RE-2026-0001',
    detail: {},
    ...partial,
  };
}

describe('actionLabel', () => {
  it('uebersetzt die bekannten Vorgaenge', () => {
    expect(actionLabel('INVOICE_CANCELLED')).toBe('Rechnung storniert');
    expect(actionLabel('PAYROLL_REOPENED')).toBe('Lohnmonat wieder geöffnet');
    expect(actionLabel('TIME_ENTRY_CORRECTED')).toBe('Arbeitszeit korrigiert');
  });

  it('verschluckt einen unbekannten Schluessel nicht', () => {
    expect(actionLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
  });
});

describe('auditDetailText', () => {
  // Intl setzt ein geschuetztes Leerzeichen vor das Euro-Zeichen; darum wird
  // hier auf das Muster und nicht auf die Zeichenkette geprueft.
  it('nennt den Betrag einer ausgestellten Rechnung', () => {
    expect(auditDetailText(event({ detail: { gross_total_cents: 28560 } })))
      .toMatch(/^285,60\s€ brutto$/);
  });

  it('nimmt den Betrag auch als Zeichenkette, wie PostgREST bigint liefert', () => {
    expect(auditDetailText(event({ detail: { gross_total_cents: '28560' } })))
      .toMatch(/^285,60\s€ brutto$/);
  });

  it('nennt den Stornogrund und sagt es, wenn keiner da ist', () => {
    expect(auditDetailText(event({ action: 'INVOICE_CANCELLED', detail: { reason: 'Falscher Zeitraum' } })))
      .toBe('Grund: Falscher Zeitraum');
    expect(auditDetailText(event({ action: 'INVOICE_CANCELLED', detail: {} })))
      .toBe('Ohne angegebenen Grund');
    expect(auditDetailText(event({ action: 'INVOICE_CANCELLED', detail: { reason: '   ' } })))
      .toBe('Ohne angegebenen Grund');
  });

  it('zeigt die Rollenaenderung als Vorher und Nachher', () => {
    expect(auditDetailText(event({
      action: 'MEMBER_ROLE_CHANGED',
      detail: { previous_role: 'EMPLOYEE', role: 'OFFICE' },
    }))).toBe('Mitarbeiter → Büro');
  });

  it('benennt die geaenderten Firmendaten-Felder, nicht ihre Werte', () => {
    const text = auditDetailText(event({
      action: 'COMPANY_SETTINGS_CHANGED',
      subjectType: 'company',
      detail: { fields: ['iban', 'bic'] },
    }));
    expect(text).toBe('IBAN, BIC');
  });

  it('nennt beim Zwei-Faktor-Zwang ausnahmsweise den Wert', () => {
    expect(auditDetailText(event({
      action: 'COMPANY_SETTINGS_CHANGED',
      detail: { fields: ['require_staff_mfa'], require_staff_mfa: true },
    }))).toContain('eingeschaltet');
    expect(auditDetailText(event({
      action: 'COMPANY_SETTINGS_CHANGED',
      detail: { fields: ['require_staff_mfa'], require_staff_mfa: false },
    }))).toContain('aufgehoben');
  });

  it('bleibt still, wo es nichts zu sagen gibt', () => {
    expect(auditDetailText(event({ action: 'SOMETHING_NEW', detail: {} }))).toBeNull();
    expect(auditDetailText(event({ detail: {} }))).toBeNull();
  });
});

describe('auditHref', () => {
  it('fuehrt zur Rechnung, zum Monatsabschluss und zur Arbeitszeit', () => {
    expect(auditHref(event({}))).toBe('/dashboard/abrechnung/11111111-1111-4111-8111-111111111111');
    expect(auditHref(event({ subjectType: 'payroll_period' })))
      .toBe('/dashboard/arbeitszeiten/monatsabschluss');
    expect(auditHref(event({ subjectType: 'time_entry' })))
      .toBe('/dashboard/arbeitszeiten/11111111-1111-4111-8111-111111111111');
  });

  it('erfindet kein Ziel, wo es keine Seite gibt', () => {
    expect(auditHref(event({ subjectType: 'company' }))).toBeNull();
    expect(auditHref(event({ subjectType: 'member' }))).toBeNull();
    expect(auditHref(event({ subjectId: null }))).toBeNull();
  });
});

describe('isSensitiveAction', () => {
  it('hebt hervor, was nachgesehen werden sollte', () => {
    for (const action of ['INVOICE_CANCELLED', 'PAYROLL_REOPENED', 'COMPANY_SETTINGS_CHANGED', 'MEMBER_ROLE_CHANGED']) {
      expect(isSensitiveAction(action)).toBe(true);
    }
  });

  it('markiert den Alltag nicht', () => {
    for (const action of ['INVOICE_ISSUED', 'INVOICE_PAID', 'MEMBER_ADDED', 'TIME_ENTRY_CORRECTED']) {
      expect(isSensitiveAction(action)).toBe(false);
    }
  });
});
