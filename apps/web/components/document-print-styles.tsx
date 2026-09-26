/**
 * Print rules shared by every customer-facing document sheet — the invoice and
 * the Leistungsnachweis. Kept in one place so both always leave the printer the
 * same way: A4, a proper margin, no app chrome and no shadow on the sheet.
 */
export function DocumentPrintStyles() {
  return (
    <style>{`
      @page { size: A4; margin: 16mm; }
      @media print {
        body { background: #fff; }
        .print\\:hidden { display: none !important; }
        .invoice-sheet { box-shadow: none; }
      }
    `}</style>
  );
}
