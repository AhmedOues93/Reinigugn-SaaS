import { describe, expect, it } from 'vitest';
import { renderDatevBookingCsv, revenueAccountForRate } from '@/lib/billing/datev';

describe('DATEV booking export', () => {
  it('uses revenue account in Haben and debtor account as counter account', () => {
    const csv = renderDatevBookingCsv([{
      invoiceNumber: 'RE-2026-0042',
      issueDate: '2026-09-22',
      serviceDate: '2026-09-30',
      customerName: 'Kunde GmbH',
      debtorAccount: '10001',
      currency: 'EUR',
      vatRateBasisPoints: 1900,
      grossAmountCents: 11900,
      revenueAccount: '8400',
    }]);

    expect(csv).toContain('"119,00";"H";"EUR";"8400";"10001";"2209";"RE-2026-0042"');
    expect(csv).toContain('"3009"');
  });

  it('never guesses an account for an unsupported VAT rate', () => {
    expect(revenueAccountForRate(1600, { account19: '8400', account7: '8300', account0: '8100' })).toBeNull();
  });
});
