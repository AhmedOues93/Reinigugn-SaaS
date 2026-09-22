import { requireStaffCompany } from '@/lib/auth';
import { fetchLogo } from '@/lib/billing/invoice-pdf';
import { getCompanyBranding } from '@/lib/data/branding';
import { getQuote } from '@/lib/data/sales';
import { renderQuotePdf, quoteFileName } from '@/lib/sales/quote-pdf';

export async function renderStaffQuotePdf(id: string) {
  const { company } = await requireStaffCompany();
  const [quote, branding] = await Promise.all([getQuote(id), getCompanyBranding(company.id)]);
  if (!quote || !quote.quote_number || quote.status === 'DRAFT') return null;
  return {
    bytes: await renderQuotePdf({
      quoteNumber: quote.quote_number,
      title: quote.title,
      intro: quote.intro,
      createdAt: quote.created_at,
      validUntil: quote.valid_until,
      currency: quote.currency,
      netTotalCents: quote.net_total_cents,
      vatTotalCents: quote.vat_total_cents,
      grossTotalCents: quote.gross_total_cents,
      recurringNetMonthlyCents: quote.recurring_net_monthly_cents,
      acceptedAt: quote.accepted_at,
      acceptedByName: quote.accepted_by_name,
      acceptedSignatureText: quote.accepted_signature_text,
      recipient: quote.recipient_snapshot as Record<string, unknown> | null,
      company: quote.company_snapshot as Record<string, unknown> | null,
      logo: await fetchLogo(branding?.logoUrl ?? null),
      lines: quote.lines,
    }),
    fileName: quoteFileName(quote.quote_number),
  };
}

export function quotePdfResponse(rendered: { bytes: Uint8Array; fileName: string }, inline = true) {
  return new Response(Buffer.from(rendered.bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${rendered.fileName}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
