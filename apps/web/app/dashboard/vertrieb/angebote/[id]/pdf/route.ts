import { quotePdfResponse, renderStaffQuotePdf } from '@/lib/sales/quote-pdf-data';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Nicht gefunden', { status: 404 });
  const rendered = await renderStaffQuotePdf(id);
  if (!rendered) return new Response('Nicht gefunden', { status: 404 });
  const download = new URL(request.url).searchParams.get('download') === '1';
  return quotePdfResponse(rendered, !download);
}
