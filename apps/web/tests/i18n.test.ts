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

const germanUmlautKeys = ['nav.jobs', 'nav.quality', 'common.menu', 'emp.photo.hint'] as const;

describe('i18n', () => {
  it('supports exactly the five product locales', () => {
    expect([...supportedLocales]).toEqual(['de', 'en', 'ar', 'tr', 'uk']);
  });

  it('accepts only supported locale codes', () => {
    expect(isLocale('de')).toBe(true);
    expect(isLocale('uk')).toBe(true);
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
    for (const value of Object.values(translations.de)) {
      expect(value).not.toMatch(/\b(ae|oe|ue)\b/);
      expect(value).not.toContain('?');
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
