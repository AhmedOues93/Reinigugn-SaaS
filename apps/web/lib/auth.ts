import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

export async function getCurrentCompany() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
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
    redirect('/dashboard/mein-bereich');
  }
  return { ...context, company, role: context.membership!.role as 'OWNER' | 'OFFICE' };
}
