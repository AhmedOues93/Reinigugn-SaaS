import { requireStaffCompany } from '@/lib/auth';
import { renderDatevBookingCsv, revenueAccountForRate, type DatevBookingInput } from '@/lib/billing/datev';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const { supabase, company } = await requireStaffCompany();
  const url = new URL(request.url);
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';

  const { data: settings, error: settingsError } = await supabase
    .from('companies')
    .select('datev_beraternummer,datev_mandantennummer,datev_kontenrahmen,datev_revenue_account_19,datev_revenue_account_7,datev_revenue_account_0')
    .eq('id', company.id)
    .maybeSingle();

  if (settingsError || !settings) {
    return new Response('DATEV-Einstellungen konnten nicht geladen werden.', { status: 500 });
  }

  const configErrors: string[] = [];
  if (!settings.datev_beraternummer) configErrors.push('Beraternummer fehlt.');
  if (!settings.datev_mandantennummer) configErrors.push('Mandantennummer fehlt.');
  if (!settings.datev_kontenrahmen) configErrors.push('Kontenrahmen fehlt.');

  let query = supabase
    .from('invoices')
    .select(
      'invoice_number,issue_date,service_period_end,currency,status,customer_id,customers(name,datev_debtor_account),invoice_lines(vat_rate_basis_points,gross_amount_cents)',
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
  if (error) return new Response('DATEV-Export konnte nicht erstellt werden.', { status: 500 });

  const rows: DatevBookingInput[] = [];
  const rowErrors: string[] = [];

  for (const invoice of data ?? []) {
    const customer = Array.isArray(invoice.customers) ? invoice.customers[0] : invoice.customers;
    const invoiceNumber = invoice.invoice_number ?? '';
    const debtorAccount = customer?.datev_debtor_account ?? null;
    if (!debtorAccount) {
      rowErrors.push(`${invoiceNumber}: DATEV-Debitorenkonto beim Kunden fehlt.`);
      continue;
    }

    const grouped = new Map<number, number>();
    for (const line of invoice.invoice_lines ?? []) {
      grouped.set(
        line.vat_rate_basis_points,
        (grouped.get(line.vat_rate_basis_points) ?? 0) + line.gross_amount_cents,
      );
    }

    for (const [rate, gross] of grouped) {
      const revenueAccount = revenueAccountForRate(rate, {
        account19: settings.datev_revenue_account_19,
        account7: settings.datev_revenue_account_7,
        account0: settings.datev_revenue_account_0,
      });
      if (!revenueAccount) {
        rowErrors.push(`${invoiceNumber}: kein Erlöskonto für ${(rate / 100).toLocaleString('de-DE')} % USt. hinterlegt.`);
        continue;
      }

      rows.push({
        invoiceNumber,
        issueDate: invoice.issue_date!,
        serviceDate: invoice.service_period_end,
        customerName: customer?.name ?? 'Kunde',
        debtorAccount,
        currency: invoice.currency,
        vatRateBasisPoints: rate,
        grossAmountCents: gross,
        revenueAccount,
      });
    }
  }

  if (configErrors.length || rowErrors.length) {
    const detail = [...configErrors, ...rowErrors].map((item) => `- ${item}`).join('\n');
    return new Response(
      `DATEV-Export noch nicht bereit. Bitte zuerst die Buchhaltungsdaten vervollständigen:\n\n${detail}`,
      {
        status: 422,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' },
      },
    );
  }

  const body = renderDatevBookingCsv(rows);
  const suffix = [datePattern.test(from) ? from : null, datePattern.test(to) ? to : null]
    .filter(Boolean)
    .join('_') || new Date().toISOString().slice(0, 10);

  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ReinPlan-DATEV-${suffix}.csv"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
