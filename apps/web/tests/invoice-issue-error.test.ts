import { describe, expect, it } from 'vitest';
import { invoiceIssueError } from '@/lib/billing/issue-error';

describe('invoice issuance errors', () => {
  it('names the missing fields and where to fix them', () => {
    const message = invoiceIssueError({
      message: 'Invoice master data incomplete',
      details: 'company.tax_identifier,customer.billing_address',
    });
    expect(message).toContain('Steuernummer oder USt-IdNr.');
    expect(message).toContain('Kundenadresse');
    expect(message).toContain('Einstellungen');
  });
  it('does not show arbitrary database details to the user', () => {
    expect(
      invoiceIssueError({ message: 'Invoice master data incomplete', details: 'secret.payload' }),
    ).not.toContain('secret');
    expect(
      invoiceIssueError({ message: 'unexpected database error containing personal data' }),
    ).not.toContain('personal data');
  });
  it('keeps the existing missing-line error', () => {
    expect(invoiceIssueError({ message: 'An invoice needs at least one line' })).toContain(
      'mindestens eine Leistung',
    );
  });
});
