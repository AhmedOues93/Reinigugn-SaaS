import { describe, expect, it } from 'vitest';
import {
  defaultLocale,
  direction,
  isLocale,
  isRtl,
  localeLabelKeys,
  localeTag,
  supportedLocales,
  t,
  translations,
} from '@/lib/i18n';

/** Stems that only occur when an umlaut or ß was transliterated away. */
const transliterationPattern =
  /(fuer|ueber|koenn|muess|oeffn|waehl|aender|auftraeg|qualitaet|tuerkisch|franzoesisch|rumaenisch|gebaeud|groess|hoech|zurueck|naechst|moegl|duerf|laeng|staerk|strasse|grosse)/i;

const germanUmlautKeys = ['nav.jobs', 'nav.quality', 'common.menu', 'emp.photo.hint'] as const;

describe('i18n', () => {
  it('supports exactly the six product locales', () => {
    expect([...supportedLocales]).toEqual(['de', 'en', 'ar', 'tr', 'uk', 'ru']);
  });

  it('accepts only supported locale codes', () => {
    expect(isLocale('de')).toBe(true);
    expect(isLocale('uk')).toBe(true);
    expect(isLocale('ru')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(null)).toBe(false);
  });

  it('gives every locale the complete German key set', () => {
    const germanKeys = Object.keys(translations[defaultLocale]).sort();
    for (const locale of supportedLocales) {
      expect(Object.keys(translations[locale]).sort(), `missing keys in ${locale}`).toEqual(germanKeys);
    }
  });

  it('never leaves a translation empty or equal to its key', () => {
    for (const locale of supportedLocales) {
      for (const [key, value] of Object.entries(translations[locale])) {
        expect(value.trim(), `${locale}.${key}`).not.toBe('');
        expect(value, `${locale}.${key}`).not.toBe(key);
      }
    }
  });

  it('keeps placeholders identical across locales', () => {
    const placeholders = (value: string) => (value.match(/\{[a-zA-Z]+\}/g) ?? []).sort();
    for (const [key, german] of Object.entries(translations.de)) {
      for (const locale of supportedLocales) {
        expect(placeholders(translations[locale][key as keyof typeof translations.de]), `${locale}.${key}`).toEqual(
          placeholders(german),
        );
      }
    }
  });

  it('writes German with real UTF-8 umlauts instead of transliterations', () => {
    for (const key of germanUmlautKeys) {
      expect(translations.de[key]).toMatch(/[äöüÄÖÜß]/);
    }
    for (const [key, value] of Object.entries(translations.de)) {
      // Transliterations such as "Tuerkisch" or "Franzoesisch" instead of umlauts.
      // A blocklist of real stems, because a bare /ae|oe|ue/ also matches
      // correctly spelled words like "aktuellen".
      expect(value, key).not.toMatch(transliterationPattern);
      // Mojibake: a replacement character, or a '?' sitting inside a word rather
      // than ending a question.
      expect(value, key).not.toContain('\uFFFD');
      expect(value, key).not.toMatch(/\p{L}\?\p{L}/u);
    }
  });

  it('marks only Arabic as right-to-left', () => {
    expect(isRtl('ar')).toBe(true);
    expect(direction('ar')).toBe('rtl');
    for (const locale of supportedLocales.filter((value) => value !== 'ar')) {
      expect(direction(locale)).toBe('ltr');
    }
  });

  it('maps every locale to a formatting tag and a label key', () => {
    for (const locale of supportedLocales) {
      expect(localeTag(locale)).toMatch(/^[a-z]{2}(-[A-Z]{2})?$/);
      expect(translations[locale][localeLabelKeys[locale]]).toBeTruthy();
    }
  });

  it('interpolates values and falls back to German for unknown keys', () => {
    expect(t('tr', 'dashboard.welcome', { name: 'Ayşe' })).toContain('Ayşe');
    expect(t('uk', 'emp.job.checklistProgress', { done: 2, total: 5 })).toContain('2');
    expect(t('en', 'definitely.missing.key')).toBe('definitely.missing.key');
  });
});
