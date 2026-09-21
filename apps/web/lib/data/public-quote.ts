import { createClient } from '@/lib/supabase/server';

export type PublicQuoteLine = {
  position: number;
  description: string;
  quantity: number;
  unit: string;
  unit_price_cents: number;
  vat_rate_basis_points: number;
  recurrence: string;
  net_amount_cents: number;
  vat_amount_cents: number;
  gross_amount_cents: number;
};

export type PublicQuote = {
  id: string;
  quote_number: string;
  status: 'SENT' | 'ACCEPTED';
  title: string;
  intro: string | null;
  recipient_snapshot: Record<string, unknown> | null;
  company_snapshot: Record<string, unknown> | null;
  sent_at: string | null;
  created_at: string;
  valid_until: string | null;
  currency: string;
  net_total_cents: number;
  vat_total_cents: number;
  gross_total_cents: number;
  recurring_net_monthly_cents: number;
  accepted_at: string | null;
  accepted_by_name: string | null;
  acceptance_note: string | null;
  decline_reason?: string | null;
  lines: PublicQuoteLine[];
};

export async function getPublicQuote(token: string): Promise<PublicQuote | null> {
  if (!token || token.length < 32 || token.length > 256) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_public_quote', { p_token: token });
  if (error || !data || typeof data !== 'object') return null;
  return data as unknown as PublicQuote;
}
