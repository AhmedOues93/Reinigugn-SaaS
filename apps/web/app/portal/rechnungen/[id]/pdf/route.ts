import { pdfResponse, renderPortalInvoicePdf } from '@/lib/billing/invoice-pdf-data';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Nicht gefunden', { status: 404 });
  const rendered = await renderPortalInvoicePdf(id);
  if (!rendered) return new Response('Nicht gefunden', { status: 404 });
  const inline = new URL(request.url).searchParams.get('inline') === '1';
  return pdfResponse(rendered, inline ? 'inline' : 'attachment');
}
