import { appUrl } from '@/lib/utils';
import { sendMail } from '@/lib/mail/transport';

export type QuoteMailInput = {
  to: string;
  companyName: string;
  quoteNumber: string;
  title: string;
  token: string;
  pdf?: { filename: string; bytes: Uint8Array } | null;
};

export async function sendQuoteMail(input: QuoteMailInput) {
  const url = appUrl(`/angebot/${encodeURIComponent(input.token)}`);
  return sendMail({
    to: input.to,
    subject: `Angebot ${input.quoteNumber} von ${input.companyName}`,
    text:
      `Guten Tag,\n\n` +
      `${input.companyName} hat Ihnen das Angebot ${input.quoteNumber} – ${input.title} bereitgestellt.\n\n` +
      `Angebot ansehen und digital annehmen:\n${url}\n\n` +
      `Dort können Sie das Angebot auch als PDF öffnen. Die digitale Annahme wird mit Name und Zeitpunkt dokumentiert.\n\n` +
      `Mit freundlichen Grüßen\n${input.companyName}`,
    attachments: input.pdf
      ? [{ filename: input.pdf.filename, content: input.pdf.bytes, contentType: 'application/pdf' }]
      : undefined,
    idempotencyKey: `quote-${input.quoteNumber}-${input.token.slice(0, 20)}`,
  });
}

export function quotePublicUrl(token: string) {
  return appUrl(`/angebot/${encodeURIComponent(token)}`);
}
