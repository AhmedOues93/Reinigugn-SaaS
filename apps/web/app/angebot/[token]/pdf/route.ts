import { getPublicQuote } from '@/lib/data/public-quote';
import { quoteFileName, renderQuotePdf } from '@/lib/sales/quote-pdf';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const quote = await getPublicQuote(token);
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
    acceptedAt: quote.accepted_at,
    acceptedByName: quote.accepted_by_name,
    acceptedSignatureText: quote.accepted_signature_text,
    recipient: quote.recipient_snapshot,
    company: quote.company_snapshot,
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
