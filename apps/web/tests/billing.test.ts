import { describe, expect, it } from 'vitest';
import { displayInvoiceStatus } from '@/lib/data/billing';
import { formatMoney, formatPercent } from '@/lib/format';

describe('derived invoice status', () => {
  it('reports an issued invoice past its due date as overdue', () => {
    expect(displayInvoiceStatus('ISSUED', '2027-03-01', '2027-03-02')).toBe('OVERDUE');
  });

  it('does not report an invoice due today as overdue', () => {
    expect(displayInvoiceStatus('ISSUED', '2027-03-02', '2027-03-02')).toBe('ISSUED');
  });

  it('never overrides a status that is not open', () => {
    const longPast = '2020-01-01';
    expect(displayInvoiceStatus('PAID', longPast, '2027-03-02')).toBe('PAID');
    expect(displayInvoiceStatus('CANCELLED', longPast, '2027-03-02')).toBe('CANCELLED');
    expect(displayInvoiceStatus('DRAFT', null, '2027-03-02')).toBe('DRAFT');
  });

  it('treats an invoice without a due date as simply open', () => {
    expect(displayInvoiceStatus('ISSUED', null, '2027-03-02')).toBe('ISSUED');
  });
});

describe('money rendering', () => {
  it('renders minor units, never floats', () => {
    // 104125 cents is the gross of the billing SQL suite's first invoice.
    expect(formatMoney('de', 104125)).toContain('1.041,25');
    expect(formatMoney('en', 104125)).toContain('1,041.25');
  });

  it('keeps cents exact where a float would drift', () => {
    expect(formatMoney('de', 1)).toContain('0,01');
    expect(formatMoney('de', 70)).toContain('0,70');
    expect(formatMoney('de', 999999999)).toContain('9.999.999,99');
  });

  it('renders the currency it is given', () => {
    expect(formatMoney('de', 1000, 'CHF')).toContain('CHF');
  });

  it('renders VAT rates from basis points', () => {
    expect(formatPercent('de', 1900)).toContain('19');
    expect(formatPercent('de', 700)).toContain('7');
    expect(formatPercent('de', 0)).toContain('0');
  });
});
