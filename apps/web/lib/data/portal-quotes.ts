import { requirePortalCustomer } from '@/lib/data/portal';
import type { PublicQuote } from '@/lib/data/public-quote';

export type PortalQuoteSummary = {
  id: string;
  quote_number: string;
  status: 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
  title: string;
  sent_at: string | null;
  valid_until: string | null;
  gross_total_cents: number;
  recurring_net_monthly_cents: number;
  currency: string;
  accepted_at: string | null;
};

export async function listPortalQuotes(): Promise<PortalQuoteSummary[]> {
  const { supabase } = await requirePortalCustomer();
  const { data, error } = await supabase.rpc('list_my_portal_quotes');
  if (error) throw new Error('Angebote konnten nicht geladen werden.');
  return (data ?? []) as PortalQuoteSummary[];
}

export async function getPortalQuote(id: string): Promise<PublicQuote | null> {
  const { supabase } = await requirePortalCustomer();
  const { data, error } = await supabase.rpc('get_my_portal_quote', { p_quote_id: id });
  if (error) throw new Error('Angebot konnte nicht geladen werden.');
  if (!data || typeof data !== 'object') return null;
  return data as PublicQuote;
}
