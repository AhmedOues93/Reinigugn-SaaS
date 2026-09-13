import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { supportedLocales, t, translations } from '../lib/i18n';

describe('i18n dictionaries', () => {
  it('contains every core key in German, English and Arabic', () => {
    const keys = Object.keys(translations.de).sort();
    for (const locale of supportedLocales) expect(Object.keys(translations[locale]).sort()).toEqual(keys);
  });

  it('uses natural German umlauts and ß in migrated labels', () => {
    expect(t('de', 'nav.jobs')).toBe('Aufträge');
    expect(t('de', 'nav.quality')).toBe('Qualitätskontrolle');
    expect(t('de', 'nav.serviceRecords')).toBe('Leistungsnachweise');
    expect(t('de', 'status.CONFIRMED')).toBe('Bestätigt');
    expect(t('de', 'role.OFFICE')).toBe('Büro');
    expect(t('de', 'nav.leave')).toBe('Urlaub & Krankheit');
  });

  it('contains no mojibake in dictionaries or web source files', () => {
    const forbidden = /Ã|Â|â€|�/;
    for (const dictionary of Object.values(translations)) expect(JSON.stringify(dictionary)).not.toMatch(forbidden);
    const files = ['app', 'components', 'lib'].flatMap((directory) => walk(resolve(process.cwd(), directory)));
    for (const file of files) expect(readFileSync(file, 'utf8')).not.toMatch(forbidden);
  });

  it('falls back to German when a locale dictionary does not contain a key', () => {
    expect(t('en', 'missing.translation.key')).toBe('missing.translation.key');
    expect(t('ar', 'nav.quality')).toBe('مراقبة الجودة');
  });

  it('provides Arabic labels for RTL navigation', () => {
    expect(t('ar', 'nav.dashboard')).toBe('لوحة المعلومات');
    expect(t('ar', 'common.language')).toBe('اللغة');
  });

  it('sets RTL direction for Arabic and keeps the language selector available', () => {
    const layout = readFileSync(resolve(process.cwd(), 'app/layout.tsx'), 'utf8');
    const shell = readFileSync(resolve(process.cwd(), 'components/dashboard-shell.tsx'), 'utf8');
    expect(layout).toContain("dir={locale === 'ar' ? 'rtl' : 'ltr'}");
    expect(shell).toContain('<LanguageSelector locale={locale} />');
    expect(shell).toContain("label: 'nav.serviceRecords'");
    expect(shell).not.toContain("href: '/dashboard/leistungsnachweise', label: 'nav.soon'");
  });
});

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const file = resolve(directory, entry);
    return statSync(file).isDirectory() ? walk(file) : /\.(ts|tsx)$/.test(file) ? [file] : [];
  });
}
