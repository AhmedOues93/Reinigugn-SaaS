/**
 * PDF/A-3B und ZUGFeRD/Factur-X fuer die Rechnungs-PDF.
 *
 * Eine ZUGFeRD-Rechnung ist eine Hybriddatei: ein PDF, das Menschen lesen,
 * mit genau demselben Beleg noch einmal als CII-XML darin. Damit die Datei
 * langzeitarchivierbar und maschinenlesbar ist, verlangt die Spezifikation
 * PDF/A-3 — und PDF/A-3 verlangt vier Dinge, die ein gewoehnliches PDF nicht
 * mitbringt:
 *
 *   1. eingebettete Schriften (ISO 19005-3, 6.2.11.4.1),
 *   2. einen OutputIntent mit eingebettetem ICC-Profil, sobald DeviceRGB
 *      benutzt wird (6.2.4.3),
 *   3. einen XMP-Metadatenstrom im Katalog, dessen vordefinierte Felder zum
 *      Info-Dictionary passen (6.6.2.1, 6.6.2.3),
 *   4. /ID im Trailer (6.1.3).
 *
 * Alle vier Punkte sind mit veraPDF 1.26.1 gegen die erzeugte Datei
 * nachgemessen, nicht geschaetzt — siehe `scripts/verapdf.sh` und den
 * CI-Job "E-Rechnung". Vorher meldete veraPDF genau diese vier Regeln.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { AFRelationship, PDFArray, PDFDocument, PDFHexString, PDFName, type PDFFont } from 'pdf-lib';

/** Der Dateiname, den die ZUGFeRD-Spezifikation fuer das eingebettete XML vorschreibt. */
export const FACTUR_X_FILENAME = 'factur-x.xml';

/**
 * Schrift und Farbprofil liegen als Dateien neben diesem Modul.
 *
 * Liberation Sans steht unter der SIL Open Font License 1.1, das sRGB-Profil
 * unter der zlib/libpng-Lizenz; beide erlauben die Weitergabe und das
 * Einbetten ausdruecklich. Die Lizenztexte liegen unveraendert im selben
 * Ordner. Die Dateien werden bewusst nicht veraendert weitergegeben, damit
 * keine Umbenennungspflicht nach OFL-Abschnitt 3 entsteht; das Verkleinern
 * auf die tatsaechlich benutzten Zeichen macht pdf-lib beim Einbetten.
 */
const assetDirectories = [
  join(process.cwd(), 'lib/billing/assets'),
  join(process.cwd(), 'apps/web/lib/billing/assets'),
];

const assetCache = new Map<string, Uint8Array>();

function asset(name: string): Uint8Array {
  const cached = assetCache.get(name);
  if (cached) return cached;
  const errors: string[] = [];
  for (const directory of assetDirectories) {
    try {
      const bytes = new Uint8Array(readFileSync(join(directory, name)));
      assetCache.set(name, bytes);
      return bytes;
    } catch (error) {
      errors.push(`${join(directory, name)}: ${(error as Error).message}`);
    }
  }
  // Ohne Schrift oder Farbprofil waere die Datei kein PDF/A — dann ist ein
  // klarer Fehler besser als eine Datei, die nur behauptet, eine zu sein.
  throw new Error(`PDF/A-Asset ${name} nicht gefunden. ${errors.join(' | ')}`);
}

export type DocumentFonts = { regular: PDFFont; bold: PDFFont };

/** Bettet die Schriftfamilie ein, mit der das Dokument gesetzt wird. */
export async function embedDocumentFonts(pdf: PDFDocument): Promise<DocumentFonts> {
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(asset('LiberationSans-Regular.ttf'), { subset: true });
  const bold = await pdf.embedFont(asset('LiberationSans-Bold.ttf'), { subset: true });
  return { regular, bold };
}

function xmpDate(value: Date) {
  return value.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function xmlText(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export type PdfAMetadata = {
  title: string;
  author: string;
  subject: string;
  creator: string;
  producer: string;
  created: Date;
  modified: Date;
  /** Gesetzt, sobald das CII-XML eingebettet ist — dann ist es eine ZUGFeRD-Datei. */
  facturX?: { profile: string } | null;
};

/**
 * Das Erweiterungsschema, das die ZUGFeRD-Spezifikation fuer den
 * `fx:`-Namensraum verlangt. Ohne diesen Block kennt ein Leser die vier
 * `fx:`-Felder nicht, und die Datei ist kein gueltiges Factur-X.
 */
function facturXExtensionSchema() {
  const fields = [
    ['DocumentFileName', 'Text', 'Name des eingebetteten XML-Dokuments'],
    ['DocumentType', 'Text', 'Art des eingebetteten Dokuments'],
    ['Version', 'Text', 'Version der ZUGFeRD-Spezifikation'],
    ['ConformanceLevel', 'Text', 'Profil des eingebetteten Dokuments'],
  ];
  return `   <rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
    <pdfaExtension:schemas>
     <rdf:Bag>
      <rdf:li rdf:parseType="Resource">
       <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
       <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
       <pdfaSchema:prefix>fx</pdfaSchema:prefix>
       <pdfaSchema:property>
        <rdf:Seq>
${fields
  .map(
    ([name, type, description]) => `         <rdf:li rdf:parseType="Resource">
          <pdfaProperty:name>${name}</pdfaProperty:name>
          <pdfaProperty:valueType>${type}</pdfaProperty:valueType>
          <pdfaProperty:category>external</pdfaProperty:category>
          <pdfaProperty:description>${description}</pdfaProperty:description>
         </rdf:li>`,
  )
  .join('\n')}
        </rdf:Seq>
       </pdfaSchema:property>
      </rdf:li>
     </rdf:Bag>
    </pdfaExtension:schemas>
   </rdf:Description>`;
}

function xmpPacket(meta: PdfAMetadata) {
  const facturX = meta.facturX
    ? `${facturXExtensionSchema()}
   <rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
    <fx:DocumentType>INVOICE</fx:DocumentType>
    <fx:DocumentFileName>${FACTUR_X_FILENAME}</fx:DocumentFileName>
    <fx:Version>1.0</fx:Version>
    <fx:ConformanceLevel>${xmlText(meta.facturX.profile)}</fx:ConformanceLevel>
   </rdf:Description>`
    : '';
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlText(meta.title)}</rdf:li></rdf:Alt></dc:title>
   <dc:creator><rdf:Seq><rdf:li>${xmlText(meta.author)}</rdf:li></rdf:Seq></dc:creator>
   <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${xmlText(meta.subject)}</rdf:li></rdf:Alt></dc:description>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
   <xmp:CreatorTool>${xmlText(meta.creator)}</xmp:CreatorTool>
   <xmp:CreateDate>${xmpDate(meta.created)}</xmp:CreateDate>
   <xmp:ModifyDate>${xmpDate(meta.modified)}</xmp:ModifyDate>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
   <pdf:Producer>${xmlText(meta.producer)}</pdf:Producer>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
   <pdfaid:part>3</pdfaid:part>
   <pdfaid:conformance>B</pdfaid:conformance>
  </rdf:Description>
${facturX}
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>
`;
}

/**
 * Haengt das CII-XML als `factur-x.xml` an. pdf-lib schreibt dabei sowohl den
 * Namensbaum `/Names/EmbeddedFiles` als auch das `/AF`-Array im Katalog, das
 * PDF/A-3 fuer zugehoerige Dateien verlangt; `AFRelationship /Data` sagt, dass
 * die Datei die Daten des Belegs enthaelt und nicht nur eine Beilage ist.
 */
export async function attachFacturX(pdf: PDFDocument, xml: string, issued: Date) {
  await pdf.attach(new TextEncoder().encode(xml), FACTUR_X_FILENAME, {
    mimeType: 'text/xml',
    description: 'Rechnungsdaten nach EN 16931 (CII)',
    creationDate: issued,
    modificationDate: issued,
    afRelationship: AFRelationship.Data,
  });
}

/**
 * Setzt alles, was PDF/A-3B ueber ein gewoehnliches PDF hinaus verlangt.
 * Muss nach allen Seiteninhalten und vor `save()` laufen.
 */
export function finalisePdfA3(pdf: PDFDocument, meta: PdfAMetadata) {
  const context = pdf.context;

  // --- 1. OutputIntent mit eingebettetem sRGB-Profil ---------------------
  const profile = asset('sRGB.icc');
  const profileRef = context.register(
    context.flateStream(profile, { N: 3, Length: profile.length }),
  );
  const outputIntent = context.obj({
    Type: 'OutputIntent',
    S: 'GTS_PDFA1',
    OutputConditionIdentifier: PDFHexString.fromText('sRGB IEC61966-2.1'),
    Info: PDFHexString.fromText('sRGB IEC61966-2.1'),
    RegistryName: PDFHexString.fromText('http://www.color.org'),
    DestOutputProfile: profileRef,
  });
  pdf.catalog.set(PDFName.of('OutputIntents'), context.obj([context.register(outputIntent)]));

  // --- 2. XMP-Metadatenstrom --------------------------------------------
  // Unkomprimiert: Ein Leser soll den Paketkopf finden koennen, ohne das PDF
  // zu verstehen — genau dafuer gibt es die xpacket-Klammer.
  const packet = new TextEncoder().encode(xmpPacket(meta));
  const metadataRef = context.register(
    context.stream(packet, { Type: 'Metadata', Subtype: 'XML', Length: packet.length }),
  );
  pdf.catalog.set(PDFName.of('Metadata'), metadataRef);

  // --- 3. /ID im Trailer -------------------------------------------------
  // Aus dem Inhalt abgeleitet, nicht zufaellig: dieselbe Rechnung ergibt
  // dieselbe Datei, sonst waere jeder erneute Download ein anderes Dokument.
  const seed = `${meta.title}|${meta.author}|${meta.created.toISOString()}`;
  let hash = 0x811c9dc5;
  const bytes = new Uint8Array(16);
  for (let at = 0; at < 16; at += 1) {
    for (const code of seed) {
      hash = ((hash ^ (code.charCodeAt(0) + at)) * 0x01000193) >>> 0;
    }
    bytes[at] = hash & 0xff;
  }
  const id = PDFHexString.of([...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(''));
  context.trailerInfo.ID = PDFArray.withContext(context);
  (context.trailerInfo.ID as PDFArray).push(id);
  (context.trailerInfo.ID as PDFArray).push(id);
}
