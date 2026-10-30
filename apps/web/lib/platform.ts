import 'server-only';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import type { PlatformCompany } from '@/lib/platform-metrics';

/**
 * Nur fuer Betreiber von ReinPlan. Wer keiner ist, bekommt eine 404 -- die
 * Konsole soll fuer Betriebe nicht einmal als gesperrte Seite existieren.
 *
 * Die Rechte prueft die Datenbank in jeder platform_*-Funktion noch einmal;
 * dieser Riegel entscheidet nur, ob die Seite gerendert wird.
 */
export async function requirePlatformAdmin() {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase.rpc('is_platform_admin');
  if (error || data !== true) notFound();
  return { supabase, user };
}

export type PlatformAction = {
  occurred_at: string;
  actor_email: string | null;
  company_name: string | null;
  action: string;
  detail: Record<string, unknown>;
};

export async function loadPlatformOverview() {
  const { supabase, user } = await requirePlatformAdmin();
  const [companies, settings, actions] = await Promise.all([
    supabase.rpc('platform_list_companies'),
    supabase.rpc('platform_get_settings'),
    supabase.rpc('platform_list_actions', { p_limit: 25 }),
  ]);
  if (companies.error) throw new Error('Betriebe konnten nicht geladen werden.');
  if (settings.error) throw new Error('Einstellungen konnten nicht geladen werden.');
  if (actions.error) throw new Error('Protokoll konnte nicht geladen werden.');
  const settingsRow = (Array.isArray(settings.data) ? settings.data[0] : settings.data) as
    { enforce_access: boolean; updated_at: string } | null;
  return {
    email: user.email ?? null,
    companies: (companies.data ?? []) as PlatformCompany[],
    enforceAccess: settingsRow?.enforce_access === true,
    actions: (actions.data ?? []) as PlatformAction[],
  };
}
