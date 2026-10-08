import { pdfResponse, renderStaffZugferdPdf } from '@/lib/billing/invoice-pdf-data';

/**
 * Die ZUGFeRD-Hybridrechnung: ein PDF/A-3B mit dem CII-XML derselben Rechnung
 * als `factur-x.xml` darin.
 *
 * Das ist die Datei, die ein Betrieb seinem Kunden schickt, wenn dessen
 * Buchhaltung die Rechnung automatisch einlesen soll. Fehlt eine
 * Pflichtangabe, kommt 422 mit der Liste -- nicht 200 mit einem PDF, dessen
 * eingebettetes XML beim Empfaenger durchfaellt.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Nicht gefunden', { status: 404 });

  const result = await renderStaffZugferdPdf(id);
  if (!result) return new Response('Nicht gefunden', { status: 404 });
  if (!result.rendered) {
    return new Response(
      `ZUGFeRD-Rechnung noch nicht bereit:\n- ${result.errors.join('\n- ')}`,
      {
        status: 422,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' },
      },
    );
  }

  const download = new URL(request.url).searchParams.get('download') === '1';
  return pdfResponse(result.rendered, download ? 'attachment' : 'inline');
}
