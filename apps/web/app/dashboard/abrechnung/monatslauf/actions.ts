'use server';

import { revalidatePath } from 'next/cache';
import { type FormState } from '@/lib/actions';
import { requireStaffCompany } from '@/lib/auth';
import { isClosedMonth } from '@/lib/monthly-billing';

/**
 * Den Lauf wirklich ausfuehren.
 *
 * Er legt Entwuerfe an, nichts weiter. Das Ausstellen bleibt ein eigener
 * Schritt mit eigener Nummer -- eine Rechnung, die ein Automat ausstellt,
 * bekommt niemand mehr zurueck.
 */
export async function runMonthlyBilling(_: FormState, formData: FormData): Promise<FormState> {
  const month = String(formData.get('month') ?? '');
  if (!isClosedMonth(month)) {
    return { status: 'error', message: 'Bitte wähle einen abgeschlossenen Monat.' };
  }

  const { supabase } = await requireStaffCompany();
  const { data, error } = await supabase.rpc('run_monthly_billing', {
    p_month: `${month}-01`,
    p_dry_run: false,
  });
  // Die Meldung der Datenbank durchlassen: sie benennt den Monat und den
  // Grund, und eine allgemeine Ersatzmeldung macht daraus ein Support-Ticket.
  if (error) return { status: 'error', message: error.message };

  const rows = (data ?? []) as { lines_added: number }[];
  const invoices = rows.filter((row) => (row.lines_added ?? 0) > 0).length;
  const lines = rows.reduce((total, row) => total + (row.lines_added ?? 0), 0);

  revalidatePath('/dashboard/abrechnung');
  revalidatePath('/dashboard/abrechnung/monatslauf');

  return {
    status: 'success',
    message: invoices === 0
      ? 'Es gab nichts abzurechnen. Es wurde keine Rechnung angelegt.'
      : `${invoices} ${invoices === 1 ? 'Entwurf' : 'Entwürfe'} mit ${lines} ${lines === 1 ? 'Position' : 'Positionen'} angelegt. Bitte vor dem Ausstellen prüfen.`,
  };
}
