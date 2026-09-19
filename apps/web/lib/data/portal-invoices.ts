import { requirePortalCustomer } from '@/lib/data/portal';

export type PortalInvoice = {
  id: string;
  invoice_number: string;
  status: 'ISSUED' | 'PAID' | 'CANCELLED';
  issue_date: string;
  due_date: string;
  service_period_start: string;
  service_period_end: string;
  currency: string;
  gross_total_cents: number;
  is_overdue: boolean;
  paid_at: string | null;
};

export async function listPortalInvoices(): Promise<PortalInvoice[]> {
  const { supabase } = await requirePortalCustomer();
  const { data, error } = await supabase.rpc('list_my_portal_invoices');
  if (error) throw new Error('Rechnungen konnten nicht geladen werden.');
  return data ?? [];
}

/** A customer can only ever open one of their own issued invoices, never a draft. */
export async function getPortalInvoice(id: string) {
  const { supabase } = await requirePortalCustomer();
  const { data, error } = await supabase.rpc('get_my_portal_invoice', { p_invoice_id: id });
  if (error) throw new Error('Rechnung konnte nicht geladen werden.');
  const row = (data ?? [])[0];
  return row ?? null;
}
