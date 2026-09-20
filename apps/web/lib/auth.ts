import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { landingPathForRole } from '@/lib/landing';

/**
 * Which of the three apps the visitor was heading for.
 *
 * Carried into the sign-in URL so a cleaner opening the installed phone app
 * sees a screen written for them rather than the office pitch. It is a copy
 * hint and nothing else: the session still decides what anybody may open, and
 * a hand-typed value changes only which sentence is shown.
 */
async function requestedApp(): Promise<'team' | 'portal' | null> {
  try {
    const path = (await headers()).get('x-pathname') ?? '';
    if (path.startsWith('/mitarbeiter')) return 'team';
    if (path.startsWith('/portal')) return 'portal';
  } catch {
    // Header access can throw outside a request scope; the office copy is the
    // right default there.
  }
  return null;
}

export async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const app = await requestedApp();
    redirect(app ? `/login?app=${app}` : '/login');
  }
  return { supabase, user };
}

export async function getCurrentCompany() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, phone, avatar_storage_path')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!profile) return { supabase, user, profile: null, membership: null };

  const { data: membership } = await supabase
    .from('company_members')
    .select('id, company_id, role, companies(id, name, slug)')
    .eq('profile_id', profile.id)
    .eq('status', 'ACTIVE')
    .limit(1)
    .maybeSingle();

  return { supabase, user, profile, membership };
}

export async function requireOwnerCompany() {
  const context = await getCurrentCompany();
  const company = context.membership?.companies as unknown as { id: string; name: string } | null;
  if (!company || context.membership?.role !== 'OWNER') {
    throw new Error('Dieser Bereich steht nur Inhabern zur Verfügung.');
  }
  return { ...context, company };
}

export async function requireStaffCompany() {
  const context = await getCurrentCompany();
  const company = context.membership?.companies as unknown as { id: string; name: string } | null;
  if (!company || !['OWNER', 'OFFICE'].includes(context.membership?.role ?? '')) {
    redirect(landingPathForRole(context.membership?.role));
  }
  return { ...context, company, role: context.membership!.role as 'OWNER' | 'OFFICE' };
}
