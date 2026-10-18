import { describe, expect, it } from 'vitest';
import { parseBoolean, parseCents, parseDate, parseGermanNumber, parseCsvTable } from '@/lib/import/csv';
import { parseEmployeeImportCsv } from '@/lib/import/employee-csv';
import { parseObjectImportCsv } from '@/lib/import/object-csv';
import { parseCatalogImportCsv } from '@/lib/import/catalog-csv';

describe('parseCsvTable', () => {
  it('verkraftet die Byte-Order-Mark und CRLF aus Excel', () => {
    const table = parseCsvTable('﻿Name;Ort\r\nFirma;Hamburg\r\n');
    expect(table.headers).toEqual(['name', 'ort']);
    expect(table.rows).toEqual([['Firma', 'Hamburg']]);
  });

  it('schreibt Umlaute in Kopfzeilen um, statt sie zu entfernen', () => {
    expect(parseCsvTable('Objektstraße;Fläche\nx;1\n').headers).toEqual(['objektstrasse', 'flaeche']);
  });

  it('sagt es, wenn nur eine Kopfzeile da ist', () => {
    expect(() => parseCsvTable('Name;Ort\n')).toThrow(/keine Datenzeilen/);
  });

  it('zeigt auf die Zeile in der Datei, nicht auf den Index', () => {
    const table = parseCsvTable('Name\nA\nB\n');
    expect(table.lineNumber(0)).toBe(2);
    expect(table.lineNumber(1)).toBe(3);
  });
});

describe('parseGermanNumber', () => {
  it('liest die deutsche Schreibweise', () => {
    expect(parseGermanNumber('1.234,56')).toBe(1234.56);
    expect(parseGermanNumber('420,5')).toBe(420.5);
    expect(parseGermanNumber('30')).toBe(30);
    expect(parseGermanNumber('-2,5')).toBe(-2.5);
  });

  it('unterscheidet leer von ungueltig', () => {
    expect(parseGermanNumber(null)).toBeNull();
    expect(parseGermanNumber('abc')).toBeUndefined();
    expect(parseGermanNumber('12,,5')).toBeUndefined();
  });
});

describe('parseCents', () => {
  it('rundet auf ganze Cent', () => {
    expect(parseCents('14,50')).toBe(1450);
    expect(parseCents('0,80')).toBe(80);
    expect(parseCents('1.234,56')).toBe(123456);
  });

  it('gibt leer als null und Unsinn als undefined zurueck', () => {
    expect(parseCents(null)).toBeNull();
    expect(parseCents('kostenlos')).toBeUndefined();
  });
});

describe('parseDate', () => {
  it('nimmt beide Schreibweisen', () => {
    expect(parseDate('01.03.2026')).toBe('2026-03-01');
    expect(parseDate('1.3.2026')).toBe('2026-03-01');
    expect(parseDate('2026-03-01')).toBe('2026-03-01');
  });

  it('weist alles andere ab', () => {
    expect(parseDate('März 2026')).toBeUndefined();
    expect(parseDate('01/03/2026')).toBeUndefined();
    expect(parseDate(null)).toBeNull();
  });
});

describe('parseBoolean', () => {
  it('versteht die ueblichen Schreibweisen', () => {
    expect(parseBoolean('Ja')).toBe(true);
    expect(parseBoolean('nein')).toBe(false);
    expect(parseBoolean('x')).toBe(true);
    expect(parseBoolean('vielleicht')).toBeUndefined();
    expect(parseBoolean(null)).toBeNull();
  });
});

describe('Mitarbeiter-Import', () => {
  const header = 'Vorname;Nachname;E-Mail;Personalnummer;Wochenstunden;Lohngruppe;Stundenlohn;Eintritt;Beschäftigung';

  it('liest eine Personalzeile vollstaendig', () => {
    const rows = parseEmployeeImportCsv(
      `${header}\nAnna;Beispiel;Anna.Beispiel@Example.DE;MA-001;30;RG 2;14,50;01.03.2026;Teilzeit\n`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      firstName: 'Anna',
      lastName: 'Beispiel',
      email: 'anna.beispiel@example.de',
      phone: null,
      employeeNumber: 'MA-001',
      weeklyHours: 30,
      wageGroup: 'RG 2',
      hourlyWageCents: 1450,
      employmentStartDate: '2026-03-01',
      employmentType: 'PART_TIME',
      notes: null,
    });
  });

  it('verlangt die Spalten, ohne die eine Einladung nicht geht', () => {
    expect(() => parseEmployeeImportCsv('Nachname;E-Mail\nB;a@b.de\n')).toThrow(/Vorname/);
    expect(() => parseEmployeeImportCsv('Vorname;Nachname\nA;B\n')).toThrow(/E-Mail/);
    expect(() => parseEmployeeImportCsv('Vorname;E-Mail\nA;a@b.de\n')).toThrow(/Nachname/);
  });

  it('nennt die Zeile, in der etwas fehlt oder falsch ist', () => {
    expect(() => parseEmployeeImportCsv(`${header}\nAnna;Beispiel;keine-adresse;;;;;;\n`))
      .toThrow(/Zeile 2.*keine E-Mail-Adresse/);
    expect(() => parseEmployeeImportCsv(`${header}\nAnna;Beispiel;a@b.de;;200;;;;\n`))
      .toThrow(/Zeile 2.*0 und 168/);
    expect(() => parseEmployeeImportCsv(`${header}\nAnna;Beispiel;a@b.de;;;;;Ostern;\n`))
      .toThrow(/Zeile 2.*kein Datum/);
    expect(() => parseEmployeeImportCsv(`${header}\nAnna;Beispiel;a@b.de;;;;;;Werkvertrag\n`))
      .toThrow(/Zeile 2.*Beschäftigungsart/);
  });

  it('faengt dieselbe Adresse zweimal ab, bevor die Datenbank es tut', () => {
    expect(() => parseEmployeeImportCsv(
      `${header}\nAnna;Eins;a@b.de;;;;;;\nBernd;Zwei;A@B.DE;;;;;;\n`,
    )).toThrow(/Zeile 3.*zweimal/);
  });

  it('erkennt alle vier Beschaeftigungsarten', () => {
    const map = [['Vollzeit', 'FULL_TIME'], ['Teilzeit', 'PART_TIME'], ['Minijob', 'MINIJOB'], ['Sonstige', 'OTHER']];
    for (const [input, expected] of map) {
      const rows = parseEmployeeImportCsv(`${header}\nA;B;a@b.de;;;;;;${input}\n`);
      expect(rows[0].employmentType).toBe(expected);
    }
  });
});

describe('Objekt-Import', () => {
  it('liest Objekt samt Kundenzuordnung', () => {
    const rows = parseObjectImportCsv(
      'Kundennummer;Objekt;Straße;PLZ;Ort;Fläche\nK-42;Treppenhaus B;Musterstr. 1;60311;Frankfurt;420,5\n',
    );
    expect(rows[0]).toMatchObject({
      customerNumber: 'K-42',
      objectName: 'Treppenhaus B',
      postalCode: '60311',
      areaSqm: 420.5,
    });
  });

  it('verlangt eine Zuordnung zum Kunden', () => {
    expect(() => parseObjectImportCsv('Objekt;PLZ\nTreppenhaus;60311\n')).toThrow(/Kunde/);
  });

  it('verlangt einen Objektnamen', () => {
    expect(() => parseObjectImportCsv('Kunde;Objekt\nFirma;\n')).toThrow(/Zeile 2.*Objektname/);
  });

  it('weist eine Flaeche ab, die keine Zahl ist', () => {
    expect(() => parseObjectImportCsv('Kunde;Objekt;Fläche\nFirma;Büro;groß\n'))
      .toThrow(/Zeile 2.*Fläche/);
  });
});

describe('Leistungskatalog-Import', () => {
  it('liest eine Preislistenzeile', () => {
    const rows = parseCatalogImportCsv(
      'Leistung;Kategorie;Einheit;Leistung pro Stunde;Material;Materialbasis\n' +
      'Unterhaltsreinigung Büro;Unterhalt;qm;250;0,80;pro Einsatz\n',
    );
    expect(rows[0]).toEqual({
      name: 'Unterhaltsreinigung Büro',
      category: 'Unterhalt',
      unit: 'QM',
      productivityPerHour: 250,
      minutesPerUnit: null,
      materialCents: 80,
      materialBasis: 'PRO_EINSATZ',
      description: null,
    });
  });

  it('raet keine Einheit', () => {
    expect(() => parseCatalogImportCsv('Leistung;Einheit\nFensterreinigung;Fensterflügel\n'))
      .toThrow(/Zeile 2.*keine bekannte Einheit/);
    expect(() => parseCatalogImportCsv('Leistung;Einheit\nFensterreinigung;\n'))
      .toThrow(/Zeile 2.*keine bekannte Einheit/);
  });

  it('versteht die ueblichen Schreibweisen der Einheiten', () => {
    for (const [input, expected] of [['qm', 'QM'], ['m2', 'QM'], ['Std', 'STUNDE'], ['Stück', 'STUECK'], ['Einsatz', 'EINSATZ'], ['Pauschale', 'PAUSCHAL']]) {
      expect(parseCatalogImportCsv(`Leistung;Einheit\nTest;${input}\n`)[0].unit).toBe(expected);
    }
  });

  it('nimmt fehlendes Material als null Cent, nicht als unbekannt', () => {
    const rows = parseCatalogImportCsv('Leistung;Einheit\nGrundreinigung;Einsatz\n');
    expect(rows[0].materialCents).toBe(0);
    expect(rows[0].materialBasis).toBe('PRO_EINSATZ');
  });

  it('weist eine doppelte Leistung in derselben Datei ab', () => {
    expect(() => parseCatalogImportCsv('Leistung;Einheit\nBüro;qm\nbüro;Stunde\n'))
      .toThrow(/Zeile 3.*zweimal/);
  });

  it('weist negative Vorgaben ab', () => {
    expect(() => parseCatalogImportCsv('Leistung;Einheit;Material\nBüro;qm;-1\n'))
      .toThrow(/Zeile 2.*Materialkosten/);
  });
});
