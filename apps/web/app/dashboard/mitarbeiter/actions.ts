'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { employeeInvitationSchema, employeeUpdateSchema, invitationTokenSchema, passwordSchema } from '@reinigung/validation';
import { type FormState } from '@/lib/actions';
import { landingPathForRole } from '@/lib/landing';
import { requireStaffCompany } from '@/lib/auth';
import { createInvitationToken, hashInvitationToken, invitationExpiresAt, invitationCookieName, type InvitationPreview } from '@/lib/invitations';
import { mailService } from '@/lib/mail/invitations';
import { createClient } from '@/lib/supabase/server';
import { canInviteMember } from '@/lib/member-permissions';
import { appUrl } from '@/lib/utils';

function failure(message: string): FormState { return { status: 'error', message }; }

export async function inviteEmployee(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = employeeInvitationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? 'Bitte prüfe deine Eingaben.');
  try {
    const { supabase, role, company } = await requireStaffCompany();
    if (!canInviteMember(role, parsed.data.role)) return failure('Das Büro kann nur Mitarbeiter einladen.');
    const token = createInvitationToken();
    const expiresAt = invitationExpiresAt();
    const { data, error } = await supabase.rpc('create_employee_invitation', {
      p_email: parsed.data.email, p_first_name: parsed.data.first_name, p_last_name: parsed.data.last_name, p_phone: parsed.data.phone ?? '', p_role: parsed.data.role,
      p_employee_number: parsed.data.employee_number ?? '', p_weekly_hours: parsed.data.weekly_hours ?? null, p_employment_start_date: parsed.data.employment_start_date ?? null, p_notes: parsed.data.notes ?? '',
      p_token_hash: hashInvitationToken(token), p_expires_at: expiresAt,
    });
    const invitation = data?.[0];
    if (error || !invitation) return failure('Die Einladung konnte nicht erstellt werden.');
    const { error: masterDataError } = await supabase.rpc('set_employee_master_data', { p_member_id: invitation.member_id, p_employee_number: parsed.data.employee_number ?? '', p_weekly_hours: parsed.data.weekly_hours ?? null, p_employment_start_date: parsed.data.employment_start_date ?? null, p_employment_end_date: parsed.data.employment_end_date ?? null, p_employment_type: parsed.data.employment_type ?? null, p_preferred_language: parsed.data.preferred_language, p_notes: parsed.data.notes ?? '' });
    if (masterDataError) return failure('Die Einladung wurde erstellt, aber die Arbeitsdaten konnten nicht gespeichert werden.');
    const delivery = await mailService.sendInvitation({ to: parsed.data.email, companyName: company.name, firstName: parsed.data.first_name, role: parsed.data.role, token });
    revalidatePath('/dashboard/mitarbeiter');
    return { status: 'success', id: invitation.member_id, message: delivery.developmentUrl ? 'Einladung erstellt. In der lokalen Entwicklung steht der Link unten bereit.' : 'Einladung wurde erstellt.', invitationUrl: delivery.developmentUrl };
  } catch { return failure('Die Einladung konnte nicht erstellt werden.'); }
}

export async function resendEmployeeInvitation(memberId: string): Promise<FormState> {
  try {
    const { supabase, company } = await requireStaffCompany();
    const token = createInvitationToken();
    const { data, error } = await supabase.rpc('resend_company_invitation', { p_member_id: memberId, p_token_hash: hashInvitationToken(token), p_expires_at: invitationExpiresAt() });
    const invitation = data?.[0];
    if (error || !invitation) return failure('Die Einladung konnte nicht erneut versendet werden.');
    const employee = await supabase.from('company_members').select('invited_first_name, role').eq('id', memberId).single();
    const delivery = await mailService.sendInvitation({ to: invitation.email, companyName: company.name, firstName: employee.data?.invited_first_name ?? 'Teammitglied', role: employee.data?.role ?? 'EMPLOYEE', token });
    revalidatePath(`/dashboard/mitarbeiter/${memberId}`);
    return { status: 'success', message: delivery.developmentUrl ? 'Einladung wurde erneürt.' : 'Einladung wurde erneut versendet.', invitationUrl: delivery.developmentUrl };
  } catch { return failure('Die Einladung konnte nicht erneut versendet werden.'); }
}

export async function updateEmployee(memberId: string, _: FormState, formData: FormData): Promise<FormState> {
  const parsed = employeeUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? 'Bitte prüfe deine Eingaben.');
  try {
    const { supabase } = await requireStaffCompany();
    const { error } = await supabase.rpc('update_company_member', {
      p_member_id: memberId, p_first_name: parsed.data.first_name, p_last_name: parsed.data.last_name, p_phone: parsed.data.phone ?? '', p_role: parsed.data.role,
      p_employee_number: parsed.data.employee_number ?? '', p_weekly_hours: parsed.data.weekly_hours ?? null, p_employment_start_date: parsed.data.employment_start_date ?? null, p_notes: parsed.data.notes ?? '',
    });
    if (error) return failure('Der Mitarbeiter konnte nicht aktualisiert werden.');
    const { error: masterDataError } = await supabase.rpc('set_employee_master_data', { p_member_id: memberId, p_employee_number: parsed.data.employee_number ?? '', p_weekly_hours: parsed.data.weekly_hours ?? null, p_employment_start_date: parsed.data.employment_start_date ?? null, p_employment_end_date: parsed.data.employment_end_date ?? null, p_employment_type: parsed.data.employment_type ?? null, p_preferred_language: parsed.data.preferred_language, p_notes: parsed.data.notes ?? '' });
    if (masterDataError) return failure('Der Mitarbeiter wurde gespeichert, aber die Arbeitsdaten konnten nicht aktualisiert werden.');
    revalidatePath('/dashboard/mitarbeiter'); revalidatePath(`/dashboard/mitarbeiter/${memberId}`);
    return { status: 'success', id: memberId };
  } catch { return failure('Der Mitarbeiter konnte nicht aktualisiert werden.'); }
}

export async function setEmployeeActive(memberId: string, isActive: boolean) {
  try {
    const { supabase } = await requireStaffCompany();
    const { error } = await supabase.rpc('set_company_member_active', { p_member_id: memberId, p_is_active: isActive });
    if (error) return { error: 'Der Mitarbeiterstatus konnte nicht aktualisiert werden.' };
    revalidatePath('/dashboard/mitarbeiter'); revalidatePath(`/dashboard/mitarbeiter/${memberId}`);
    return { error: null };
  } catch { return { error: 'Der Mitarbeiterstatus konnte nicht aktualisiert werden.' }; }
}

async function invitationTokenFromCookie() {
  const token = (await cookies()).get(invitationCookieName)?.value;
  const parsed = invitationTokenSchema.safeParse(token);
  return parsed.success ? parsed.data : null;
}

export async function signUpFromInvitation(_: FormState, formData: FormData): Promise<FormState> {
  const password = passwordSchema.safeParse(formData.get('password'));
  const token = await invitationTokenFromCookie();
  if (!password.success) return failure(password.error.issues[0]?.message ?? 'Bitte prüfe dein Passwort.');
  if (!token) return failure('Der Einladungslink ist ungültig oder abgelaufen.');
  const supabase = await createClient();
  const { data: previewData } = await supabase.rpc('get_invitation_preview', { p_token: token }).maybeSingle();
  const preview = previewData as InvitationPreview | null;
  if (!preview) return failure('Der Einladungslink ist ungültig oder abgelaufen.');
  const { data: signUpData, error } = await supabase.auth.signUp({ email: preview.email, password: password.data, options: { emailRedirectTo: appUrl('/auth/callback?next=/einladung') } });
  if (error) return failure('Konto konnte nicht erstellt werden. Melde dich an, falls bereits ein Konto besteht.');
  if (signUpData.session) return completeInvitationFromCookie();
  return { status: 'success', message: 'Bitte bestätige deine E-Mail-Adresse. Danach kannst du die Einladung abschliessen.' };
}

async function completeInvitationFromCookie(): Promise<FormState> {
  const token = await invitationTokenFromCookie();
  if (!token) return failure('Der Einladungslink ist ungültig oder abgelaufen.');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return failure('Bitte melde dich zuerst an.');
  const { data: previewData } = await supabase.rpc('get_invitation_preview', { p_token: token }).maybeSingle();
  const preview = previewData as InvitationPreview | null;
  const { error } = await supabase.rpc('complete_company_invitation', { p_token: token });
  if (error) return failure('Die Einladung konnte nicht angenommen werden. Stelle sicher, dass du mit der eingeladenen E-Mail-Adresse angemeldet bist.');
  (await cookies()).delete(invitationCookieName);
  revalidatePath('/dashboard');
  // Land on the surface that belongs to the accepted role, not always the dashboard.
  return { status: 'success', id: 'accepted', redirectTo: landingPathForRole(preview?.role) };
}

export async function acceptInvitation(_: FormState, _formData: FormData): Promise<FormState> {
  return completeInvitationFromCookie();
}
