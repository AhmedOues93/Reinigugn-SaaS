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

/**
 * Kundenabnahme in the portal: the customer confirms the service was performed
 * as agreed.
 *
 * This confirms the **service**, not an invoice. The invoice is a separate
 * document that follows later and is never something the customer is asked to
 * approve.
 */
export async function confirmPortalService(jobId: string, _: FormState): Promise<FormState> {
  const { supabase, membership } = await getCurrentCompany();
  const locale = await portalLocale().catch(() => 'de' as const);
  if (!membership || membership.role !== 'CUSTOMER') {
    return { status: 'error', message: t(locale, 'common.notAllowed') };
  }

  const { error } = await supabase.rpc('confirm_my_portal_service', { p_job_id: jobId });
  if (error) return { status: 'error', message: t(locale, 'common.errorBody') };

  revalidatePath('/portal/leistungen');
  revalidatePath(`/portal/leistungen/${jobId}`);
  revalidatePath('/dashboard/leistungsnachweise');
  return { status: 'success', message: t(locale, 'portal.acceptance.confirmed') };
}

/**
 * The other answer. A customer who is not happy is not left with a choice
 * between approving and saying nothing.
 *
 * Nothing about the recorded service is rewritten — the evidence stands. What
 * this creates is a Reklamation in the company's existing complaint workflow,
 * and a state that keeps the visit out of the billing queue until the office
 * has dealt with it.
 */
export async function disputePortalService(jobId: string, _: FormState, formData: FormData): Promise<FormState> {
  const { supabase, membership } = await getCurrentCompany();
  const locale = await portalLocale().catch(() => 'de' as const);
  if (!membership || membership.role !== 'CUSTOMER') {
    return { status: 'error', message: t(locale, 'common.notAllowed') };
  }

  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  if (title.length < 2 || title.length > 160 || description.length < 2 || description.length > 4000) {
    return { status: 'error', message: t(locale, 'portal.acceptance.problemIncomplete') };
  }

  const { error } = await supabase.rpc('dispute_my_portal_service', {
    p_job_id: jobId,
    p_title: title,
    p_description: description,
  });
  if (error) return { status: 'error', message: t(locale, 'common.errorBody') };

  revalidatePath('/portal/leistungen');
  revalidatePath(`/portal/leistungen/${jobId}`);
  revalidatePath('/portal/reklamationen');
  revalidatePath('/dashboard/leistungsnachweise');
  revalidatePath('/dashboard/reklamationen');
  return { status: 'success', message: t(locale, 'portal.acceptance.problemReported') };
}
