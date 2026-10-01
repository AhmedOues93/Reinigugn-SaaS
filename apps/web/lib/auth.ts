import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { landingPathForRole } from '@/lib/landing';
import { type AssuranceLevel, mfaDecision, mfaRedirect } from '@/lib/mfa';

/**
 * Which of the three apps the visitor was heading for.
 *
 * Carried into the sign-in URL so a cleaner opening the installed phone app
 * sees a screen written for them rather than the office pitch. It is a copy
 * hint and nothing else: the session still decides what anybody may open, and
 * a hand-typed value changes only which sentence is shown.
 */
async function currentPathname(): Promise<string | null> {
  try {
    return (await headers()).get('x-pathname');
  } catch {
    return null;
  }
}

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
    redirect(app === 'team' ? '/mitarbeiter/login' : app === 'portal' ? '/kunde/login' : '/admin/login');
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
    .select('id, company_id, role, companies(id, name, slug, require_staff_mfa)')
    .eq('profile_id', profile.id)
    .eq('status', 'ACTIVE')
    .limit(1)
    .maybeSingle();

  return { supabase, user, profile, membership };
}

/**
 * Where this visitor belongs, or null if they are not signed in.
 *
 * `getCurrentCompany` redirects an anonymous visitor to the sign-in screen,
 * which is right for every screen behind the session and wrong for the public
 * landing page — the people it is written for are exactly the ones that
 * redirect would bounce. This asks the same question without deciding anything
 * on the answer, so the caller can show the marketing page instead.
 */
export async function signedInLandingPath(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (!profile) return null;

  const { data: membership } = await supabase
    .from('company_members')
    .select('role')
    .eq('profile_id', profile.id)
    .eq('status', 'ACTIVE')
    .limit(1)
    .maybeSingle();
  if (!membership) return null;

  return landingPathForRole(membership.role);
}

/**
 * Den Zwei-Faktor-Riegel vorlegen, bevor eine Buero-Seite Daten laedt.
 *
 * Steht hier und nicht nur im Layout: ein Layout entscheidet, was zu sehen
 * ist, aber Server Actions laufen daran vorbei. Der Riegel kostet keine
 * Abfrage -- das Niveau steht im Token, der Zwang kam mit der Mitgliedschaft.
 */
export async function staffMfaRedirect(
  supabase: Awaited<ReturnType<typeof createClient>>,
  required: boolean,
): Promise<string | null> {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const decision = mfaDecision({
    currentLevel: (data?.currentLevel ?? null) as AssuranceLevel,
    nextLevel: (data?.nextLevel ?? null) as AssuranceLevel,
    required,
  });
  return mfaRedirect(decision, await currentPathname());
}

async function enforceStaffMfa(
  supabase: Awaited<ReturnType<typeof createClient>>,
  required: boolean,
) {
  const target = await staffMfaRedirect(supabase, required);
  if (target) redirect(target);
}

export async function requireOwnerCompany() {
  const context = await getCurrentCompany();
  const company = context.membership?.companies as unknown as
    { id: string; name: string; require_staff_mfa?: boolean | null } | null;
  if (!company || context.membership?.role !== 'OWNER') {
    throw new Error('Dieser Bereich steht nur Inhabern zur Verfügung.');
  }
  await enforceStaffMfa(context.supabase, company.require_staff_mfa === true);
  return { ...context, company };
}

export async function requireStaffCompany() {
  const context = await getCurrentCompany();
  const company = context.membership?.companies as unknown as
    { id: string; name: string; require_staff_mfa?: boolean | null } | null;
  if (!company || !['OWNER', 'OFFICE'].includes(context.membership?.role ?? '')) {
    redirect(landingPathForRole(context.membership?.role));
  }
  await enforceStaffMfa(context.supabase, company.require_staff_mfa === true);
  return { ...context, company, role: context.membership!.role as 'OWNER' | 'OFFICE' };
}
