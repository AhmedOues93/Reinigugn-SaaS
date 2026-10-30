export type DatevBookingInput = {
  invoiceNumber: string;
  issueDate: string;
  serviceDate: string;
  customerName: string;
  debtorAccount: string;
  currency: string;
  vatRateBasisPoints: number;
  grossAmountCents: number;
  revenueAccount: string;
};

function csv(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function amount(cents: number) {
  return (cents / 100).toFixed(2).replace('.', ',');
}

function belegdatum(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return match ? `${match[3]}${match[2]}` : '';
}

/**
 * A compact DATEV-oriented booking CSV using DATEV's canonical field names.
 *
 * We deliberately do not invent accounts or tax keys. The tenant config
 * provides the revenue account and each customer provides its debtor account.
 * The revenue account is posted in HABEN; DATEV's S/H flag refers to "Konto".
 */
export function renderDatevBookingCsv(rows: DatevBookingInput[]) {
  const header = [
    'Umsatz (ohne Soll/Haben-Kz)',
    'Soll/Haben-Kennzeichen',
    'WKZ Umsatz',
    'Konto',
    'Gegenkonto (ohne BU-Schlüssel)',
    'Belegdatum',
    'Belegfeld 1',
    'Buchungstext',
    'Leistungsdatum',
  ];

  const lines = rows.map((row) => [
    amount(row.grossAmountCents),
    'H',
    row.currency,
    row.revenueAccount,
    row.debtorAccount,
    belegdatum(row.issueDate),
    row.invoiceNumber.slice(0, 36),
    `Rechnung ${row.invoiceNumber} · ${row.customerName}`.slice(0, 60),
    belegdatum(row.serviceDate),
  ].map(csv).join(';'));

  return '\uFEFF' + [header.map(csv).join(';'), ...lines].join('\r\n');
}

export function revenueAccountForRate(
  rate: number,
  config: { account19: string | null; account7: string | null; account0: string | null },
) {
  if (rate === 1900) return config.account19;
  if (rate === 700) return config.account7;
  if (rate === 0) return config.account0;
  return null;
}
