/**
 * Eine CSV-Vorlage zum Herunterladen.
 *
 * Mit Byte-Order-Mark und CRLF, weil Excel sonst Umlaute zerlegt und alles in
 * eine Spalte schreibt. Das ist kein Schoenheitsfehler: wer die Vorlage
 * oeffnet und Unsinn sieht, laedt nichts mehr hoch.
 */
export function csvTemplateResponse(filename: string, header: string[], example: string[]): Response {
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const body = '﻿' + header.join(';') + '\r\n' + example.map(quote).join(';') + '\r\n';
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
