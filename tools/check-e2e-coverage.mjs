#!/usr/bin/env node
/**
 * Haelt fest, dass die authentifizierte Suite wirklich gelaufen ist.
 *
 * Der Grund: diese Specs ueberspringen sich absichtlich, wenn ihre
 * Voraussetzungen fehlen -- `requireRole` ohne Zugangsdaten, und Faelle wie
 * "no job assigned to this employee in this environment". Das ist richtig so,
 * damit niemand eine Zusicherung fuer erfuellt haelt, die nie geprueft wurde.
 *
 * Nur: ein Lauf, in dem sich *alles* uebersprungen hat, ist in Playwrights
 * Augen gruen. Ein leerer Seed, ein vergessener Zugang, eine Datenbank, die
 * nicht hochkam -- all das sieht dann wie ein erfolgreicher Testlauf aus, und
 * genau diese Verwechslung soll die Suite ja verhindern.
 *
 * Darum diese Pruefung: *jede* Spec-Datei muss ueber alle Projekte zusammen
 * mindestens einen Test wirklich ausgefuehrt haben. Keine geratene Zahl --
 * eine Datei, die nirgends zum Zuge kommt, ist in jedem Fall ein Befund, und
 * eine Datei mit einem gelaufenen Test beweist, dass Anmeldung und Daten da
 * sind.
 *
 * Bewusst keine Obergrenze fuer uebersprungene Tests: die haengt an der Zahl
 * der Projekte und waere bei jeder neuen Spec falsch. Stattdessen wird die
 * Verteilung ausgegeben, damit ein Mensch eine Verschiebung sieht.
 *
 * Aufruf:
 *   node tools/check-e2e-coverage.mjs apps/web/playwright-report.json
 */
import { readFileSync } from 'node:fs';

const reportPath = process.argv[2];
if (!reportPath) {
  console.error('Aufruf: node tools/check-e2e-coverage.mjs <playwright-report.json>');
  process.exit(2);
}

let report;
try {
  report = JSON.parse(readFileSync(reportPath, 'utf8'));
} catch (error) {
  console.error(`Der Bericht ${reportPath} ist nicht lesbar: ${error.message}`);
  console.error('Ohne Bericht ist nicht feststellbar, ob die Suite gelaufen ist. Das gilt als Fehlschlag.');
  process.exit(1);
}

/**
 * Playwrights JSON-Bericht ist ein Baum aus Suiten, die wiederum Suiten
 * enthalten koennen. Die Datei steht am aeusseren Knoten, die Ergebnisse
 * liegen in den Blaettern.
 */
function* walk(suite, file = suite.file) {
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      for (const result of test.results ?? []) {
        yield {
          file: spec.file ?? file,
          title: spec.title,
          line: spec.line,
          status: result.status,
          errors: result.errors ?? [],
        };
      }
    }
  }
  for (const child of suite.suites ?? []) yield* walk(child, child.file ?? file);
}

/**
 * Die erste Zeile, die etwas sagt.
 *
 * Playwrights Fehlertext ist lang: Quellausschnitt, Aufrufprotokoll,
 * Anhaenge. Zum Entscheiden reicht fast immer die Fehlerzeile und, wenn es
 * ein Warten war, worauf gewartet wurde. Der Rest steht im Protokoll des
 * Laufs und im Bericht; hier soll ein Mensch (oder ein Agent mit begrenztem
 * Blick) in zwanzig Zeilen sehen, was los ist.
 */
function digest(error) {
  const lines = (error.message ?? '').replace(/\u001b\[[0-9;]*m/g, '').split('\n');
  const first = lines.find((line) => line.trim())?.trim() ?? '(ohne Meldung)';
  const waitedFor = lines.find((line) => /^\s*-\s*waiting for/.test(line))?.trim();
  const resolved = lines.find((line) => /locator resolved to/.test(line))?.trim();
  return [first, waitedFor, resolved].filter(Boolean);
}

const perFile = new Map();
/** Jeder Testlauf, fuer den Fehlerauszug weiter unten. */
const collected = [];
let executed = 0;
let skipped = 0;

for (const suite of report.suites ?? []) {
  for (const run of walk(suite)) {
    const { file, status } = run;
    collected.push(run);
    const counts = perFile.get(file) ?? { executed: 0, skipped: 0 };
    // `skipped` heisst: der Test hat seinen Koerper nie betreten. Alles
    // andere -- passed, failed, timedOut, interrupted -- ist ein Lauf.
    if (status === 'skipped') {
      counts.skipped += 1;
      skipped += 1;
    } else {
      counts.executed += 1;
      executed += 1;
    }
    perFile.set(file, counts);
  }
}

if (perFile.size === 0) {
  console.error('Der Bericht enthaelt keinen einzigen Test. Die Suite ist nicht gelaufen.');
  process.exit(1);
}

const width = Math.max(...[...perFile.keys()].map((file) => file.length));
console.log('Ausgefuehrt / uebersprungen, je Spec-Datei:\n');
for (const [file, counts] of [...perFile].sort(([a], [b]) => a.localeCompare(b))) {
  const mark = counts.executed === 0 ? 'LEER' : '    ';
  console.log(`  ${mark} ${file.padEnd(width)}  ${String(counts.executed).padStart(3)} / ${counts.skipped}`);
}
console.log(`\n  Summe: ${executed} ausgefuehrt, ${skipped} uebersprungen`);

const empty = [...perFile].filter(([, counts]) => counts.executed === 0).map(([file]) => file);

if (executed === 0) {
  console.error(
    '\nKein einziger Test wurde ausgefuehrt -- alles hat sich uebersprungen.\n' +
      'Das ist kein gruener Lauf, sondern eine fehlende Voraussetzung: Zugangsdaten,\n' +
      'Seed oder die Datenbank selbst. Siehe die Meldungen des Testlaufs darueber.',
  );
  process.exit(1);
}

const failures = collected.filter((entry) => entry.status !== 'skipped' && entry.status !== 'passed');

/*
  Der Auszug urteilt nicht: ob der Lauf bestanden hat, sagt Playwrights
  eigener Exit-Code, und der Schritt davor ist daran schon gescheitert. Hier
  geht es nur darum, die Befunde in wenigen Zeilen lesbar zu machen -- ein
  Protokoll mit 300 Zeilen Quellausschnitt und Anhaengen beantwortet die
  Frage "was ist kaputt" schlechter als drei Zeilen je Fall.
*/
if (failures.length > 0) {
  console.log(`\n${failures.length} Testlauf/-laeufe nicht bestanden:\n`);
  for (const entry of failures) {
    console.log(`  ${entry.file}:${entry.line ?? '?'}  ${entry.title}  [${entry.status}]`);
    for (const error of entry.errors.slice(0, 1)) {
      for (const line of digest(error)) console.log(`      ${line}`);
    }
  }
}

if (empty.length > 0) {
  console.error(
    `\nDiese Spec-Dateien haben in keinem Projekt einen Test ausgefuehrt:\n` +
      empty.map((file) => `  - ${file}`).join('\n') +
      '\n\nEntweder fehlen ihre Voraussetzungen im Seed, oder sie ueberspringen sich\n' +
      'inzwischen immer. Beides heisst: die Zusicherungen darin sind ungeprueft.',
  );
  process.exit(1);
}

console.log('\nJede Spec-Datei hat mindestens einen Test wirklich ausgefuehrt.');
