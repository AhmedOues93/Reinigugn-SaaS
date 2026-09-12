'use server';

import { revalidatePath } from 'next/cache';
import { type FormState } from '@/lib/actions';
import { getCurrentCompany } from '@/lib/auth';

async function run(jobId: string, operation: 'start_my_job' | 'stop_my_job'): Promise<FormState> {
  const { supabase, membership } = await getCurrentCompany();
  if (!membership || membership.role !== 'EMPLOYEE') return { status: 'error', message: 'Nicht berechtigt.' };
  const { error } = await supabase.rpc(operation, { p_job_id: jobId });
  if (error) return { status: 'error', message: operation === 'start_my_job' ? 'Der Einsatz konnte nicht gestartet werden.' : 'Der Einsatz konnte nicht beendet werden.' };
  revalidatePath('/dashboard'); revalidatePath('/dashboard/mein-bereich'); revalidatePath(`/dashboard/mein-bereich/${jobId}`); revalidatePath('/dashboard/arbeitszeiten');
  return { status: 'success', message: operation === 'start_my_job' ? 'Einsatz gestartet.' : 'Einsatz beendet.' };
}

export async function startMyJob(jobId: string, _: FormState, __: FormData) { return run(jobId, 'start_my_job'); }
export async function stopMyJob(jobId: string, _: FormState, __: FormData) { return run(jobId, 'stop_my_job'); }
