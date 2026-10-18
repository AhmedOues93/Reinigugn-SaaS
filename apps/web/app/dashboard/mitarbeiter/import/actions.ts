'use server';

import { revalidatePath } from 'next/cache';
import { type FormState } from '@/lib/actions';
import { requireStaffCompany } from '@/lib/auth';
import { createInvitationToken, hashInvitationToken, invitationExpiresAt } from '@/lib/invitations';
import { MAX_IMPORT_ROWS, readImportFile } from '@/lib/import/limits';
import { parseEmployeeImportCsv } from '@/lib/import/employee-csv';

/**
 * Mitarbeiterinnen aus einer Personalliste uebernehmen.
 *
 * Der Import legt Einladungen an und verschickt bewusst **keine** E-Mail. Eine
 * Datei mit vierzig Zeilen hochzuladen und damit vierzig Menschen anzuschreiben
 * waere eine Nebenwirkung, die niemand erwartet -- zumal eine Zeile sich leicht
 * vertippt. Versendet wird einzeln, mit dem Knopf, der schon da ist.
 *
 * Geht eine Zeile schief, bleiben die vorigen bestehen. Alles oder nichts
 * waere hier schlechter: bei dreissig gueltigen und einer falschen Zeile will
 * niemand von vorn anfangen, und die Meldung sagt genau, welche fehlt.
 */
export async function importEmployeesCsv(_: FormState, formData: FormData): Promise<FormState> {
  const file = await readImportFile(formData.get('file'));
  if ('error' in file) return { status: 'error', message: file.error };

  let rows;
  try {
    rows = parseEmployeeImportCsv(file.text);
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Die CSV-Datei konnte nicht gelesen werden.',
    };
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    return { status: 'error', message: `Maximal ${MAX_IMPORT_ROWS} Datenzeilen pro Import.` };
  }

  const { supabase } = await requireStaffCompany();
  let created = 0;
  const skipped: string[] = [];
  const failed: string[] = [];

  for (const row of rows) {
    const { data, error } = await supabase.rpc('create_employee_invitation', {
      p_email: row.email,
      p_first_name: row.firstName,
      p_last_name: row.lastName,
      p_phone: row.phone ?? '',
      p_role: 'EMPLOYEE',
      p_employee_number: row.employeeNumber ?? '',
      p_weekly_hours: row.weeklyHours,
      p_employment_start_date: row.employmentStartDate,
      p_notes: row.notes ?? '',
      p_token_hash: hashInvitationToken(createInvitationToken()),
      p_expires_at: invitationExpiresAt(),
    });

    const invitation = data?.[0];
    if (error || !invitation) {
      // Wer schon da ist, ist kein Fehler, sondern der normale Fall beim
      // zweiten Lauf derselben Datei.
      if (error?.message.includes('already exists')) skipped.push(row.email);
      else failed.push(`${row.email}${error ? ` (${error.message})` : ''}`);
      continue;
    }

    const { error: masterDataError } = await supabase.rpc('set_employee_master_data', {
      p_member_id: invitation.member_id,
      p_employee_number: row.employeeNumber ?? '',
      p_weekly_hours: row.weeklyHours,
      p_employment_start_date: row.employmentStartDate,
      p_employment_end_date: null,
      p_employment_type: row.employmentType,
      p_preferred_language: 'de',
      p_notes: row.notes ?? '',
      p_wage_group: row.wageGroup,
      p_hourly_wage_cents: row.hourlyWageCents,
    });
    if (masterDataError) failed.push(`${row.email} (Arbeitsdaten: ${masterDataError.message})`);
    created += 1;
  }

  revalidatePath('/dashboard/mitarbeiter');

  const parts = [`${created} ${created === 1 ? 'Einladung' : 'Einladungen'} angelegt`];
  if (skipped.length) parts.push(`${skipped.length} bereits vorhanden und übersprungen`);
  if (failed.length) parts.push(`${failed.length} fehlgeschlagen: ${failed.slice(0, 5).join(', ')}`);

  return {
    status: failed.length && created === 0 ? 'error' : 'success',
    message: `${parts.join(' · ')}. Es wurde noch keine E-Mail versendet — Einladungen versendest du einzeln in der Mitarbeiterliste.`,
  };
}
