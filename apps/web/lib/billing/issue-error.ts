const fieldLabels: Record<string, string> = {
  'company.name': 'Firmenname',
  'company.street': 'Firmenstraße',
  'company.postal_code': 'Firmen-PLZ',
  'company.city': 'Firmenort',
  'company.tax_identifier': 'Steuernummer oder USt-IdNr.',
  'customer.name': 'Kundenname',
  'customer.billing_address': 'Kundenadresse',
  'customer.postal_code': 'Kunden-PLZ',
  'customer.city': 'Kundenort',
};

export function invoiceIssueError(error: { message: string; details?: string | null }): string {
  if (error.message.includes('Invoice master data incomplete')) {
    const fields = [
      ...new Set(
        (error.details ?? '')
          .split(',')
          .map((field) => fieldLabels[field.trim()])
          .filter(Boolean),
      ),
    ];
    return fields.length
      ? `Bitte ergänze vor dem Ausstellen: ${fields.join(', ')}. Firmendaten findest du in den Einstellungen, Kundendaten beim Kunden.`
      : 'Bitte vervollständige die Firmen- und Kundenstammdaten vor dem Ausstellen.';
  }
  return error.message.includes('at least one line')
    ? 'Eine Rechnung braucht mindestens eine Leistung.'
    : 'Die Rechnung konnte nicht ausgestellt werden.';
}
