import { describe, expect, it } from 'vitest';
import { stripDemoPrefix } from '@/lib/demo-label';

describe('stripDemoPrefix', () => {
  it('removes the bracket spelling', () => {
    expect(stripDemoPrefix('[TESTDATEN] Schlüssel im Büro')).toBe('Schlüssel im Büro');
  });

  it('removes the dash spelling, en dash or hyphen', () => {
    expect(stripDemoPrefix('TESTDATEN – Code 1234')).toBe('Code 1234');
    expect(stripDemoPrefix('TESTDATEN - Code 1234')).toBe('Code 1234');
  });

  it('ignores case', () => {
    expect(stripDemoPrefix('testdaten – Hinweis')).toBe('Hinweis');
  });

  it('only strips a leading marker, never text further in', () => {
    expect(stripDemoPrefix('Hinweis zu TESTDATEN – Ablage')).toBe('Hinweis zu TESTDATEN – Ablage');
  });

  it('leaves ordinary text untouched', () => {
    expect(stripDemoPrefix('Eingang über den Hof')).toBe('Eingang über den Hof');
  });

  it('returns an empty string for missing values', () => {
    expect(stripDemoPrefix(null)).toBe('');
    expect(stripDemoPrefix(undefined)).toBe('');
  });
});
