import { getCurrentCompany } from '@/lib/auth';
import type { JobPhoto } from '@/lib/data/job-photos';

function first<T>(value: T | T[] | null) { return Array.isArray(value) ? value[0] ?? null : value; }

export async function listOperationalPhotos(scope: 'COMPLAINT' | 'QUALITY_INSPECTION', recordId: string) {
  const { supabase, membership } = await getCurrentCompany();
  if (!membership) return [];
  let query = supabase.from('operational_photos').select('id, member_id, category, description, created_at, storage_path, company_members(profiles!company_members_profile_id_fkey(first_name, last_name))').eq('scope', scope).order('created_at', { ascending: false });
  query = scope === 'COMPLAINT' ? query.eq('complaint_id', recordId) : query.eq('quality_inspection_id', recordId);
  const { data, error } = await query;
  if (error) throw new Error('Fotos konnten nicht geladen werden.');
  return Promise.all((data ?? []).map(async (photo) => {
    const { data: signed } = await supabase.storage.from('job-photos').createSignedUrl(photo.storage_path, 900);
    const member = first(photo.company_members); const profile = member ? first(member.profiles) : null;
    return { id: photo.id, member_id: photo.member_id, category: photo.category, description: photo.description, created_at: photo.created_at, checklist_item: null, uploader: [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Mitarbeiter', url: signed?.signedUrl ?? null } satisfies JobPhoto;
  }));
}
