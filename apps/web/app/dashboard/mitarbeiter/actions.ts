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
    let authFallbackSent = false;
    let authFallbackError: string | null = null;
    if (!delivery.delivered) {
      const invitationNext = `/einladung/start?token=${encodeURIComponent(token)}`;
      const { error: fallbackError } = await supabase.auth.signInWithOtp({
        email: parsed.data.email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: appUrl(`/auth/callback?next=${encodeURIComponent(invitationNext)}`),
        },
      });
      authFallbackSent = !fallbackError;
      authFallbackError = fallbackError?.message ?? null;
    }
    revalidatePath('/dashboard/mitarbeiter');
    return {
      status: delivery.delivered || authFallbackSent ? 'success' : 'error',
      id: invitation.member_id,
      message: delivery.delivered
        ? 'Einladung wurde per E-Mail versendet.'
        : authFallbackSent
          ? 'Einladung wurde über die verifizierte Supabase-E-Mail versendet.'
          : `Mitarbeiter wurde angelegt, aber keine Einladungs-E-Mail konnte versendet werden.${authFallbackError ? ` ${authFallbackError}` : ''}`,
      invitationUrl: !delivery.delivered && !authFallbackSent
        ? (delivery.developmentUrl ?? appUrl(`/einladung/start?token=${encodeURIComponent(token)}`))
        : undefined,
    };
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
    let authFallbackSent = false;
    let authFallbackError: string | null = null;
    if (!delivery.delivered) {
      const invitationNext = `/einladung/start?token=${encodeURIComponent(token)}`;
      const { error: fallbackError } = await supabase.auth.signInWithOtp({
        email: invitation.email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: appUrl(`/auth/callback?next=${encodeURIComponent(invitationNext)}`),
        },
      });
      authFallbackSent = !fallbackError;
      authFallbackError = fallbackError?.message ?? null;
    }
    revalidatePath('/dashboard/mitarbeiter');
    revalidatePath(`/dashboard/mitarbeiter/${memberId}`);
    return {
      status: delivery.delivered || authFallbackSent ? 'success' : 'error',
      message: delivery.delivered
        ? 'Einladung wurde erneut per E-Mail versendet.'
        : authFallbackSent
          ? 'Einladung wurde erneut über die verifizierte Supabase-E-Mail versendet.'
          : `Die Einladung wurde erneuert, aber keine E-Mail konnte versendet werden.${authFallbackError ? ` ${authFallbackError}` : ''}`,
      invitationUrl: !delivery.delivered && !authFallbackSent
        ? (delivery.developmentUrl ?? appUrl(`/einladung/start?token=${encodeURIComponent(token)}`))
        : undefined,
    };
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
  const confirmation = String(formData.get('password_confirmation') ?? '');
  const token = await invitationTokenFromCookie();
  if (!password.success) return failure(password.error.issues[0]?.message ?? 'Bitte prüfe dein Passwort.');
  if (password.data !== confirmation) return failure('Die Passwörter stimmen nicht überein.');
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
  const { data: acceptedMemberId, error } = await supabase.rpc('complete_company_invitation', { p_token: token });
  if (error) return failure('Die Einladung konnte nicht angenommen werden. Stelle sicher, dass du mit der eingeladenen E-Mail-Adresse angemeldet bist.');
  (await cookies()).delete(invitationCookieName);
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/mitarbeiter');
  if (acceptedMemberId) revalidatePath(`/dashboard/mitarbeiter/${acceptedMemberId}`);
  // Land on the surface that belongs to the accepted role, not always the dashboard.
  return { status: 'success', id: 'accepted', redirectTo: landingPathForRole(preview?.role) };
}

export async function acceptInvitation(_: FormState, formData: FormData): Promise<FormState> {
  const password = passwordSchema.safeParse(formData.get('password'));
  const confirmation = String(formData.get('password_confirmation') ?? '');
  if (!password.success) return failure(password.error.issues[0]?.message ?? 'Bitte prüfe dein Passwort.');
  if (password.data !== confirmation) return failure('Die Passwörter stimmen nicht überein.');

  const token = await invitationTokenFromCookie();
  if (!token) return failure('Der Einladungslink ist ungültig oder abgelaufen.');

  const supabase = await createClient();
  const [{ data: { user } }, { data: previewData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc('get_invitation_preview', { p_token: token }).maybeSingle(),
  ]);
  const preview = previewData as InvitationPreview | null;
  if (!user?.email || !preview) return failure('Bitte öffne zuerst den verifizierten Link aus deiner E-Mail.');
  if (user.email.toLocaleLowerCase() !== preview.email.toLocaleLowerCase()) {
    return failure(`Bitte öffne die Einladung mit ${preview.email}.`);
  }

  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) return failure('Das Passwort konnte nicht gespeichert werden.');

  return completeInvitationFromCookie();
}
