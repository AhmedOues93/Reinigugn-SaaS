import { getInvoice } from '@/lib/data/billing';
import { getCompanyProfile } from '@/lib/data/onboarding';
import {
  renderXRechnung,
  validateXRechnung,
  xrechnungFileName,
  type XRechnungInput,
} from '@/lib/billing/xrechnung';

type Invoice = NonNullable<Awaited<ReturnType<typeof getInvoice>>>;

/**
 * Kontaktangaben, die aus dem Firmenstamm nachgereicht werden duerfen.
 *
 * company_snapshot wird beim Ausstellen eingefroren, und das ist richtig: was
 * berechnet wurde, darf sich nicht nachtraeglich aendern. Die
 * Verkaeufer-Kontaktgruppe BG-6 ist aber keine Rechnungsposition, sondern die
 * Auskunft, wie der Verkaeufer erreichbar ist — und sie wurde erst mit der
 * XRechnung zur Pflicht. Ohne diesen Rueckfall bliebe jede vor dieser
 * Umstellung ausgestellte Rechnung fuer immer unvollstaendig: das Buero
 * traegt die Telefonnummer in den Einstellungen nach, und die Rechnung
 * scheitert weiterhin, weil der eingefrorene Abzug sie nicht kennt.
 *
 * Betraege, Adressen, Steuer- und Bankdaten werden bewusst NICHT
 * nachgereicht. Sie gehoeren zum Inhalt der Rechnung und bleiben so, wie sie
 * ausgestellt wurde.
 */
const CONTACT_FALLBACK_FIELDS = ['phone', 'email'] as const;

function withContactFallback(
  snapshot: Record<string, unknown> | null,
  live: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!snapshot || !live) return snapshot;
  const merged = { ...snapshot };
  for (const field of CONTACT_FALLBACK_FIELDS) {
    const current = merged[field];
    const hasValue = typeof current === 'string' && current.trim() !== '';
    if (!hasValue && typeof live[field] === 'string' && (live[field] as string).trim() !== '') {
      merged[field] = live[field];
    }
  }
  return merged;
}

export function invoiceToXRechnungInput(
  invoice: Invoice,
  liveCompany?: Record<string, unknown> | null,
): XRechnungInput | null {
  if (
    invoice.status === 'DRAFT' ||
    invoice.status === 'CANCELLED' ||
    !invoice.invoice_number ||
    !invoice.issue_date ||
    !invoice.due_date
  ) {
    return null;
  }

  return {
    invoiceNumber: invoice.invoice_number,
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date,
    servicePeriodStart: invoice.service_period_start,
    servicePeriodEnd: invoice.service_period_end,
    currency: invoice.currency,
    buyerReference: invoice.buyer_reference ?? null,
    netTotalCents: invoice.net_total_cents,
    vatTotalCents: invoice.vat_total_cents,
    grossTotalCents: invoice.gross_total_cents,
    customer: invoice.customer_snapshot as Record<string, unknown> | null,
    company: withContactFallback(invoice.company_snapshot as Record<string, unknown> | null, liveCompany ?? null),
    lines: invoice.lines.map((line) => ({
      position: line.position,
      description: line.description,
      quantity: Number(line.quantity),
      unit: line.unit,
      unit_price_cents: line.unit_price_cents,
      vat_rate_basis_points: line.vat_rate_basis_points,
      net_amount_cents: line.net_amount_cents,
      vat_amount_cents: line.vat_amount_cents,
    })),
  };
}

export function xrechnungReadiness(
  invoice: Invoice,
  liveCompany?: Record<string, unknown> | null,
): { ready: boolean; errors: string[] } {
  const input = invoiceToXRechnungInput(invoice, liveCompany);
  if (!input) return { ready: false, errors: ['Nur ausgestellte, nicht stornierte Rechnungen können als XRechnung exportiert werden.'] };
  const errors = validateXRechnung(input);
  return { ready: errors.length === 0, errors };
}

export async function renderStaffXRechnung(id: string) {
  const [invoice, liveCompany] = await Promise.all([getInvoice(id), getCompanyProfile()]);
  if (!invoice) return null;
  const input = invoiceToXRechnungInput(invoice, liveCompany as Record<string, unknown> | null);
  if (!input) return null;
  const errors = validateXRechnung(input);
  if (errors.length) return { errors, xml: null, fileName: null };
  return {
    errors: [],
    xml: renderXRechnung(input),
    fileName: xrechnungFileName(input.invoiceNumber),
  };
}
