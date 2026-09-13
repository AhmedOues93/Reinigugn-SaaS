'use server';
import { revalidatePath } from 'next/cache';
import { getCurrentCompany } from '@/lib/auth';
export async function markNotificationRead(id: string) { const { supabase, membership } = await getCurrentCompany(); if (!membership) throw new Error('Nicht berechtigt.'); const { error } = await supabase.from('in_app_notifications').update({ read_at: new Date().toISOString() }).eq('id', id).eq('recipient_member_id', membership.id); if (error) throw new Error('Benachrichtigung konnte nicht aktualisiert werden.'); revalidatePath('/dashboard/nachrichten'); revalidatePath('/dashboard', 'layout'); }
