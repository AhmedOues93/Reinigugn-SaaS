import { renderStaffCii } from '@/lib/billing/invoice-xrechnung-data';

/**
 * Das CII-XML einer Rechnung zum Einzeldownload.
 *
 * Dieselbe Rechnung wie unter /xrechnung, nur in der Syntax, die ZUGFeRD und
 * Factur-X verlangen. Getrennte Route, weil beide Formate gebraucht werden:
 * eine XRechnung an eine Behoerde wird als UBL erwartet, ein ZUGFeRD-PDF
 * traegt CII.
 *
 * Ist die Rechnung nicht exportfaehig, kommt 422 mit der Liste der fehlenden
 * Angaben -- nicht 200 mit einem unvollstaendigen Dokument. Eine Datei, die
 * aussieht wie eine Rechnung und beim Empfaenger durchfaellt, ist schlimmer
 * als keine.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Nicht gefunden', { status: 404 });

  const rendered = await renderStaffCii(id);
  if (!rendered) return new Response('Nicht gefunden', { status: 404 });
  if (!rendered.xml || !rendered.fileName) {
    return new Response(
      `ZUGFeRD-XML noch nicht bereit:\n- ${rendered.errors.join('\n- ')}`,
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
