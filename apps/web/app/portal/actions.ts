'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { type FormState } from '@/lib/actions';
import { getCurrentCompany } from '@/lib/auth';
import { portalLocale } from '@/lib/data/portal';
import { t } from '@/lib/i18n';

/**
 * Portal writes. The action confirms the CUSTOMER role and then hands off to a
 * security-definer function that re-derives the tenant and the customer from the
 * session, so a forged object or job id cannot reach another customer's data.
 */
export async function createPortalComplaint(_: FormState, formData: FormData): Promise<FormState> {
  const { supabase, membership } = await getCurrentCompany();
  const locale = await portalLocale().catch(() => 'de' as const);
  if (!membership || membership.role !== 'CUSTOMER') return { status: 'error', message: t(locale, 'common.notAllowed') };

  const objectId = String(formData.get('cleaning_object_id') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const jobId = String(formData.get('job_id') ?? '').trim() || null;

  if (!objectId || title.length < 2 || title.length > 160 || description.length < 2 || description.length > 4000) {
    return { status: 'error', message: t(locale, 'common.errorBody') };
  }

  const { error } = await supabase.rpc('create_my_portal_complaint', {
    p_object_id: objectId,
    p_title: title,
    p_description: description,
    p_job_id: jobId,
  });
  if (error) return { status: 'error', message: t(locale, 'common.errorBody') };

  revalidatePath('/portal/reklamationen');
  revalidatePath('/dashboard/reklamationen');
  redirect('/portal/reklamationen');
}
