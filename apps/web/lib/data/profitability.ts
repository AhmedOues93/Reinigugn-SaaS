import { requireStaffCompany } from '@/lib/auth';
import { type ObjectProfitability } from '@/lib/profitability';

type Row = {
  object_id: string;
  object_name: string;
  customer_name: string;
  visits: number;
  worked_minutes: number | string;
  minutes_without_rate: number | string;
  revenue_cents: number | string;
  labour_cost_cents: number | string | null;
  margin_cents: number | string | null;
  margin_bp: number | null;
};

const toNumber = (value: number | string | null) => (value === null ? null : Number(value));

export async function listObjectProfitability(from: string, to: string): Promise<ObjectProfitability[]> {
  const { supabase } = await requireStaffCompany();
  const { data, error } = await supabase.rpc('object_profitability', { p_from: from, p_to: to });
  if (error) throw new Error('Die Objektrentabilität konnte nicht geladen werden.');

  return ((data ?? []) as Row[]).map((row) => ({
    objectId: row.object_id,
    objectName: row.object_name,
    customerName: row.customer_name,
    visits: row.visits ?? 0,
    workedMinutes: Number(row.worked_minutes ?? 0),
    minutesWithoutRate: Number(row.minutes_without_rate ?? 0),
    revenueCents: Number(row.revenue_cents ?? 0),
    labourCostCents: toNumber(row.labour_cost_cents),
    marginCents: toNumber(row.margin_cents),
    marginBp: row.margin_bp,
  }));
}
