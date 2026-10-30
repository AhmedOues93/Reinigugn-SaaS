import { renderStaffXRechnung } from '@/lib/billing/invoice-xrechnung-data';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Nicht gefunden', { status: 404 });

  const rendered = await renderStaffXRechnung(id);
  if (!rendered) return new Response('Nicht gefunden', { status: 404 });
  if (!rendered.xml || !rendered.fileName) {
    return new Response(
      `XRechnung noch nicht bereit:\n- ${rendered.errors.join('\n- ')}`,
      {
        status: 422,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' },
      },
    );
  }

  return new Response(rendered.xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${rendered.fileName}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
