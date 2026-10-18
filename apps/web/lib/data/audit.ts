import { requireStaffCompany } from '@/lib/auth';
import { type AuditEvent } from '@/lib/audit';

type Row = {
  occurred_at: string;
  action: string;
  actor_name: string | null;
  subject_type: string;
  subject_id: string | null;
  subject_label: string | null;
  detail: Record<string, unknown> | null;
};

/**
 * Die Zeitleiste eines Zeitraums.
 *
 * Die Datenbank liest zwei Quellen zusammen -- das Protokoll und die
 * Arbeitszeitkorrekturen, die ihr eigenes Vorher/Nachher schon fuehren. Hier
 * wird daran nichts mehr sortiert oder gefiltert.
 */
export async function listAuditEvents(from: string, to: string): Promise<AuditEvent[]> {
  const { supabase } = await requireStaffCompany();
  const { data, error } = await supabase.rpc('list_audit_events', { p_from: from, p_to: to });
  if (error) throw new Error('Das Protokoll konnte nicht geladen werden.');

  return ((data ?? []) as Row[]).map((row) => ({
    occurredAt: row.occurred_at,
    action: row.action,
    actorName: row.actor_name,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    subjectLabel: row.subject_label,
    detail: row.detail ?? {},
  }));
}
