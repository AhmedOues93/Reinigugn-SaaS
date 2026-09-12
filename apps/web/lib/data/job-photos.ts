import { getCurrentCompany, requireStaffCompany } from '@/lib/auth';

export type JobPhoto = { id: string; member_id: string; category: 'BEFORE' | 'AFTER' | 'DOCUMENTATION'; description: string | null; created_at: string; checklist_item: { title: string } | null; uploader: string; url: string | null };

function first<T>(value: T | T[] | null) { return Array.isArray(value) ? value[0] ?? null : value; }

async function withSignedUrls(supabase: Awaited<ReturnType<typeof getCurrentCompany>>['supabase'], photos: { id: string; member_id: string; category: 'BEFORE' | 'AFTER' | 'DOCUMENTATION'; description: string | null; created_at: string; storage_path: string; job_checklist_items: { title: string } | { title: string }[] | null; company_members: { profiles: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null } | { profiles: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null }[] | null }[]) {
  return Promise.all(photos.map(async (photo) => {
    const { data } = await supabase.storage.from('job-photos').createSignedUrl(photo.storage_path, 900);
    const member = first(photo.company_members); const profile = member ? first(member.profiles) : null;
    return { id: photo.id, member_id: photo.member_id, category: photo.category, description: photo.description, created_at: photo.created_at, checklist_item: first(photo.job_checklist_items), uploader: [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Mitarbeiter', url: data?.signedUrl ?? null } satisfies JobPhoto;
  }));
}

const selection = 'id, member_id, category, description, created_at, storage_path, job_checklist_items(title), company_members(profiles!company_members_profile_id_fkey(first_name, last_name))';

export async function listStaffJobPhotos(jobId: string) {
  const { supabase, company } = await requireStaffCompany();
  const { data, error } = await supabase.from('job_photos').select(selection).eq('company_id', company.id).eq('job_id', jobId).order('created_at', { ascending: false });
  if (error) throw new Error('Fotos konnten nicht geladen werden.');
  return withSignedUrls(supabase, data ?? []);
}

export async function listMyJobPhotos(jobId: string) {
  const { supabase, membership } = await getCurrentCompany();
  if (!membership || membership.role !== 'EMPLOYEE') return [];
  const { data, error } = await supabase.from('job_photos').select(selection).eq('job_id', jobId).order('created_at', { ascending: false });
  if (error) throw new Error('Fotos konnten nicht geladen werden.');
  return withSignedUrls(supabase, data ?? []);
}
