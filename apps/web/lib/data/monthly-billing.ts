import { requireStaffCompany } from '@/lib/auth';
import { type BillingRunRow } from '@/lib/monthly-billing';

type Row = {
  customer_id: string;
  customer_name: string;
  invoice_id: string | null;
  outcome: string;
  lines_added: number;
  skipped_without_price: number;
  net_total_cents: number | string;
  reason: string | null;
};

function toRows(data: Row[] | null): BillingRunRow[] {
  return (data ?? []).map((row) => ({
    customerId: row.customer_id,
    customerName: row.customer_name,
    invoiceId: row.invoice_id,
    outcome: row.outcome as BillingRunRow['outcome'],
    linesAdded: row.lines_added ?? 0,
    skippedWithoutPrice: row.skipped_without_price ?? 0,
    netTotalCents: Number(row.net_total_cents ?? 0),
    reason: row.reason,
  }));
}

/**
 * Die Vorschau. Schreibt nichts -- `p_dry_run` ist hier fest true, damit ein
 * Seitenaufruf niemals Rechnungen anlegt.
 */
export async function previewMonthlyBilling(month: string): Promise<BillingRunRow[]> {
  const { supabase } = await requireStaffCompany();
  const { data, error } = await supabase.rpc('run_monthly_billing', {
    p_month: `${month}-01`,
    p_dry_run: true,
  });
  if (error) throw new Error(error.message);
  return toRows(data as Row[] | null);
}
