/**
 * Holt das eingebettete `factur-x.xml` aus einer ZUGFeRD-Rechnung heraus.
 *
 *   node tools/extract-factur-x.mjs rechnung.pdf ziel.xml
 *
 * Damit prueft der CI-Lauf nicht das XML, das der Code *gerade erzeugt hat*,
 * sondern das, was wirklich in der ausgelieferten Datei steht. Dazwischen
 * liegt das Einbetten -- und genau dort koennte etwas verloren gehen, ohne
 * dass es ein Test am XML-Generator bemerkt.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const [source, target] = process.argv.slice(2);
if (!source || !target) {
  console.error('Aufruf: node tools/extract-factur-x.mjs <rechnung.pdf> <ziel.xml>');
  process.exit(2);
}

const pdf = readFileSync(source);
const marker = Buffer.from('stream');
const found = [];

for (let at = pdf.indexOf(marker); at !== -1; at = pdf.indexOf(marker, at + 1)) {
  let from = at + marker.length;
  if (pdf[from] === 0x0d) from += 1;
  if (pdf[from] === 0x0a) from += 1;
  const to = pdf.indexOf(Buffer.from('endstream'), from);
  if (to === -1) continue;
  const slice = pdf.subarray(from, to);
  for (const candidate of [() => inflateSync(slice), () => slice]) {
    let bytes;
    try {
      bytes = candidate();
    } catch {
      continue;
    }
    const text = bytes.toString('utf8');
    if (text.includes('CrossIndustryInvoice')) found.push(text);
  }
}

if (!found.length) {
  console.error(`In ${source} liegt kein eingebettetes CII-XML.`);
  process.exit(1);
}

writeFileSync(target, found[0], 'utf8');
console.log(`${target}: ${Buffer.byteLength(found[0])} Byte aus ${source} geholt.`);
