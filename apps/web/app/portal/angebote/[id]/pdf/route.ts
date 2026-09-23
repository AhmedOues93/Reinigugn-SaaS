import { fetchLogo } from '@/lib/billing/invoice-pdf';
import { portalBranding } from '@/lib/data/portal';
import { getPortalQuote } from '@/lib/data/portal-quotes';
import { quoteFileName, renderQuotePdf } from '@/lib/sales/quote-pdf';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Nicht gefunden', { status: 404 });

  const [quote, branding] = await Promise.all([getPortalQuote(id), portalBranding()]);
  if (!quote) return new Response('Nicht gefunden', { status: 404 });

  const bytes = await renderQuotePdf({
    quoteNumber: quote.quote_number,
    title: quote.title,
    intro: quote.intro,
    createdAt: quote.created_at,
    validUntil: quote.valid_until,
    currency: quote.currency,
    netTotalCents: Number(quote.net_total_cents),
    vatTotalCents: Number(quote.vat_total_cents),
    grossTotalCents: Number(quote.gross_total_cents),
    recurringNetMonthlyCents: Number(quote.recurring_net_monthly_cents),
    billingMode: (quote.billing_mode as 'MONATSPAUSCHALE' | 'PAUSCHALE_PRO_EINSATZ' | 'STUNDENSATZ' | null | undefined),
    acceptancePolicy: (quote.acceptance_policy as 'KEINE_ABNAHME_ERFORDERLICH' | 'VOR_ORT_UNTERSCHRIFT' | 'PORTAL_ABNAHME' | null | undefined),
    orderType: quote.order_type,
    serviceStart: quote.service_start,
    serviceEnd: quote.service_end,
    terminationNotice: quote.termination_notice,
    acceptedAt: quote.accepted_at,
    acceptedByName: quote.accepted_by_name,
    recipient: quote.recipient_snapshot,
    company: quote.company_snapshot,
    logo: await fetchLogo(branding?.logoUrl ?? null),
    lines: quote.lines.map((line) => ({
      ...line,
      quantity: Number(line.quantity),
      unit_price_cents: Number(line.unit_price_cents),
      vat_rate_basis_points: Number(line.vat_rate_basis_points),
      net_amount_cents: Number(line.net_amount_cents),
    })),
  });

  const download = new URL(request.url).searchParams.get('download') === '1';
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${quoteFileName(quote.quote_number)}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
