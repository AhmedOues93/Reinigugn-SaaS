/**
 * Das Audit-Log, soweit es ohne Datenbank zu beschreiben ist.
 *
 * Die Saetze stehen hier und nicht in der Datenbank, weil ein Protokoll
 * gelesen wird und nicht ausgewertet: wer nachsieht, wer die Bankverbindung
 * geaendert hat, braucht einen deutschen Satz und keinen Schluessel.
 */

export type AuditEvent = {
  occurredAt: string;
  action: string;
  actorName: string | null;
  subjectType: string;
  subjectId: string | null;
  subjectLabel: string | null;
  detail: Record<string, unknown>;
};

const actionLabels: Record<string, string> = {
  INVOICE_ISSUED: 'Rechnung ausgestellt',
  INVOICE_PAID: 'Rechnung als bezahlt vermerkt',
  INVOICE_CANCELLED: 'Rechnung storniert',
  INVOICE_DRAFT: 'Rechnung auf Entwurf zurückgesetzt',
  MEMBER_ADDED: 'Mitglied hinzugefügt',
  MEMBER_ROLE_CHANGED: 'Rolle geändert',
  MEMBER_STATUS_CHANGED: 'Status geändert',
  COMPANY_SETTINGS_CHANGED: 'Firmendaten geändert',
  PAYROLL_RELEASED: 'Lohnmonat freigegeben',
  PAYROLL_REOPENED: 'Lohnmonat wieder geöffnet',
  TIME_ENTRY_CORRECTED: 'Arbeitszeit korrigiert',
};

/** Ein unbekannter Schluessel wird gezeigt und nicht verschluckt. */
export function actionLabel(action: string): string {
  return actionLabels[action] ?? action;
}

const fieldLabels: Record<string, string> = {
  iban: 'IBAN',
  bic: 'BIC',
  tax_number: 'Steuernummer',
  vat_id: 'USt-IdNr.',
  billing_email: 'Rechnungs-E-Mail',
  require_staff_mfa: 'Zwei-Faktor-Pflicht',
  datev_beraternummer: 'DATEV-Beraternummer',
  datev_mandantennummer: 'DATEV-Mandantennummer',
  default_vat_rate_basis_points: 'Umsatzsteuersatz',
};

const roleLabels: Record<string, string> = {
  OWNER: 'Inhaber',
  OFFICE: 'Büro',
  EMPLOYEE: 'Mitarbeiter',
  CUSTOMER: 'Kunde',
};

function euros(cents: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function label(map: Record<string, string>, key: unknown): string {
  return typeof key === 'string' ? map[key] ?? key : '—';
}

/**
 * Was zu dem Vorgang noch zu sagen ist, in einem Satz.
 *
 * Bewusst ohne Werte, wo die Datenbank keine mitgibt: bei den Firmendaten
 * stehen die Namen der Felder im Protokoll und nicht ihr Inhalt, und das soll
 * hier auch so bleiben.
 */
export function auditDetailText(event: AuditEvent): string | null {
  const detail = event.detail ?? {};

  switch (event.action) {
    case 'INVOICE_ISSUED':
    case 'INVOICE_PAID':
      return typeof detail.gross_total_cents === 'number' || typeof detail.gross_total_cents === 'string'
        ? `${euros(Number(detail.gross_total_cents))} brutto`
        : null;
    case 'INVOICE_CANCELLED':
      return typeof detail.reason === 'string' && detail.reason.trim()
        ? `Grund: ${detail.reason}`
        : 'Ohne angegebenen Grund';
    case 'MEMBER_ADDED':
      return `Als ${label(roleLabels, detail.role)}`;
    case 'MEMBER_ROLE_CHANGED':
      return `${label(roleLabels, detail.previous_role)} → ${label(roleLabels, detail.role)}`;
    case 'MEMBER_STATUS_CHANGED':
      return `${detail.previous_status ?? '—'} → ${detail.status ?? '—'}`;
    case 'COMPANY_SETTINGS_CHANGED': {
      const fields = Array.isArray(detail.fields) ? detail.fields : [];
      const names = fields.map((field) => label(fieldLabels, field)).join(', ');
      if (typeof detail.require_staff_mfa === 'boolean') {
        const state = detail.require_staff_mfa ? 'eingeschaltet' : 'aufgehoben';
        return names ? `${names} · Zwei-Faktor-Pflicht ${state}` : `Zwei-Faktor-Pflicht ${state}`;
      }
      return names || null;
    }
    case 'PAYROLL_REOPENED':
      return typeof detail.reason === 'string' ? `Grund: ${detail.reason}` : null;
    case 'PAYROLL_RELEASED':
      return detail.sequence ? `Freigabe Nr. ${detail.sequence}` : null;
    case 'TIME_ENTRY_CORRECTED':
      return typeof detail.reason === 'string' ? `Grund: ${detail.reason}` : null;
    default:
      return null;
  }
}

/** Wohin der Vorgang fuehrt, oder null, wenn es keine Seite dafuer gibt. */
export function auditHref(event: AuditEvent): string | null {
  if (!event.subjectId) return null;
  if (event.subjectType === 'invoice') return `/dashboard/abrechnung/${event.subjectId}`;
  if (event.subjectType === 'payroll_period') return '/dashboard/arbeitszeiten/monatsabschluss';
  if (event.subjectType === 'time_entry') return `/dashboard/arbeitszeiten/${event.subjectId}`;
  return null;
}

/** Ob ein Vorgang Aufmerksamkeit verlangt, nicht nur Kenntnis. */
export function isSensitiveAction(action: string): boolean {
  return [
    'INVOICE_CANCELLED',
    'PAYROLL_REOPENED',
    'COMPANY_SETTINGS_CHANGED',
    'MEMBER_ROLE_CHANGED',
  ].includes(action);
}
