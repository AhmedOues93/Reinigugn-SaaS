import { requireStaffCompany } from '@/lib/auth';

const csv = (value: unknown) => {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
};

const cents = (value: number | null | undefined) =>
  ((value ?? 0) / 100).toFixed(2).replace('.', ',');

export async function GET(request: Request) {
  const { supabase, company } = await requireStaffCompany();
  const url = new URL(request.url);
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  let query = supabase
    .from('invoices')
    .select(
      'invoice_number,status,issue_date,due_date,paid_at,currency,net_total_cents,vat_total_cents,gross_total_cents,service_period_start,service_period_end,customer_snapshot,customers(name,customer_number,vat_id)',
    )
    .eq('company_id', company.id)
    .in('status', ['ISSUED', 'PAID'])
    .not('invoice_number', 'is', null)
    .not('issue_date', 'is', null)
    .order('issue_date', { ascending: true })
    .order('invoice_number', { ascending: true });

  if (datePattern.test(from)) query = query.gte('issue_date', from);
  if (datePattern.test(to)) query = query.lte('issue_date', to);

  const { data, error } = await query;
  if (error) return new Response('Export konnte nicht erstellt werden.', { status: 500 });

  const header = [
    'Rechnungsnummer',
    'Rechnungsdatum',
    'Leistungsbeginn',
    'Leistungsende',
    'Faellig am',
    'Bezahlt am',
    'Status',
    'Kundennummer',
    'Kunde',
    'Kunden-USt-IdNr.',
    'Netto',
    'Umsatzsteuer',
    'Brutto',
    'Waehrung',
  ];

  const rows = (data ?? []).map((invoice) => {
    const customer = Array.isArray(invoice.customers) ? invoice.customers[0] : invoice.customers;
    const snapshot = invoice.customer_snapshot && typeof invoice.customer_snapshot === 'object'
      ? invoice.customer_snapshot as Record<string, unknown>
      : null;

    return [
      invoice.invoice_number,
      invoice.issue_date,
      invoice.service_period_start,
      invoice.service_period_end,
      invoice.due_date,
      invoice.paid_at ? String(invoice.paid_at).slice(0, 10) : '',
      invoice.status === 'PAID' ? 'BEZAHLT' : 'OFFEN',
      customer?.customer_number ?? snapshot?.customer_number ?? '',
      customer?.name ?? snapshot?.name ?? '',
      customer?.vat_id ?? snapshot?.vat_id ?? '',
      cents(invoice.net_total_cents),
      cents(invoice.vat_total_cents),
      cents(invoice.gross_total_cents),
      invoice.currency,
    ].map(csv).join(';');
  });

  const body = '\uFEFF' + [header.map(csv).join(';'), ...rows].join('\r\n');
  const suffix = [datePattern.test(from) ? from : null, datePattern.test(to) ? to : null]
    .filter(Boolean)
    .join('_') || new Date().toISOString().slice(0, 10);

  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ReinPlan-Buchhaltung-${suffix}.csv"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
