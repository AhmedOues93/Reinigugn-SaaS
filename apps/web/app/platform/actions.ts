'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { addDays, berlinDateKey, berlinDateTimeToIso } from '@/lib/date';
import { requirePlatformAdmin } from '@/lib/platform';
import { UNLIMITED_COMP_YEAR } from '@/lib/platform-metrics';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function done(message: string, status: 'success' | 'error' = 'success'): never {
  revalidatePath('/platform');
  redirect(`/platform?${status}=${encodeURIComponent(message)}`);
}

function companyIdFrom(formData: FormData) {
  const value = String(formData.get('company_id') ?? '');
  if (!uuidPattern.test(value)) done('Unbekannter Betrieb.', 'error');
  return value;
}

/** Ende des gewaehlten Tages in Berlin, damit "bis 30.11." den 30. noch einschliesst. */
function endOfBerlinDay(date: string) {
  return berlinDateTimeToIso(date, '23:59');
}

function dbMessage(error: { message?: string } | null, fallback: string) {
  // Unsere eigenen Ausnahmen sind deutsche Saetze ohne Interna; alles andere
  // wird nicht durchgereicht.
  const message = error?.message ?? '';
  return /^[A-ZÄÖÜ][^\n]{5,160}\.$/.test(message) ? message : fallback;
}

export async function setTrialEnd(formData: FormData) {
  const { supabase } = await requirePlatformAdmin();
  const companyId = companyIdFrom(formData);
  const extendDays = Number(formData.get('extend_days') ?? '');
  const explicitDate = String(formData.get('trial_end') ?? '');

  let date: string;
  if (Number.isInteger(extendDays) && extendDays > 0 && extendDays <= 365) {
    date = addDays(berlinDateKey(), extendDays);
  } else if (datePattern.test(explicitDate)) {
    date = explicitDate;
  } else {
    done('Bitte ein Datum oder eine Anzahl Tage angeben.', 'error');
  }

  const { error } = await supabase.rpc('platform_set_trial_end', {
    p_company_id: companyId,
    p_trial_ends_at: endOfBerlinDay(date),
  });
  if (error) done(dbMessage(error, 'Testzeitraum konnte nicht geaendert werden.'), 'error');
  done('Testzeitraum geaendert.');
}

export async function grantCompAccess(formData: FormData) {
  const { supabase } = await requirePlatformAdmin();
  const companyId = companyIdFrom(formData);
  const unlimited = formData.get('unlimited') === 'on';
  const until = String(formData.get('until') ?? '');
  const note = String(formData.get('note') ?? '').slice(0, 300);

  let untilIso: string;
  if (unlimited) {
    untilIso = endOfBerlinDay(`${UNLIMITED_COMP_YEAR}-12-31`);
  } else if (datePattern.test(until)) {
    untilIso = endOfBerlinDay(until);
  } else {
    done('Bitte ein Enddatum waehlen oder "unbefristet" ankreuzen.', 'error');
  }

  const { error } = await supabase.rpc('platform_set_comp_access', {
    p_company_id: companyId,
    p_until: untilIso,
    p_note: note,
  });
  if (error) done(dbMessage(error, 'Freier Zugang konnte nicht vergeben werden.'), 'error');
  done('Freier Zugang vergeben.');
}

export async function revokeCompAccess(formData: FormData) {
  const { supabase } = await requirePlatformAdmin();
  const companyId = companyIdFrom(formData);
  const { error } = await supabase.rpc('platform_set_comp_access', {
    p_company_id: companyId,
    p_until: null,
    p_note: null,
  });
  if (error) done(dbMessage(error, 'Freier Zugang konnte nicht entzogen werden.'), 'error');
  done('Freier Zugang entzogen.');
}

export async function setSuspended(formData: FormData) {
  const { supabase } = await requirePlatformAdmin();
  const companyId = companyIdFrom(formData);
  const suspend = formData.get('suspend') === 'true';
  const reason = String(formData.get('reason') ?? '').slice(0, 300);
  const { error } = await supabase.rpc('platform_set_suspended', {
    p_company_id: companyId,
    p_suspended: suspend,
    p_reason: suspend ? reason : null,
  });
  if (error) done(dbMessage(error, 'Sperre konnte nicht geaendert werden.'), 'error');
  done(suspend ? 'Betrieb gesperrt.' : 'Betrieb freigegeben.');
}

export async function setEnforcement(formData: FormData) {
  const { supabase } = await requirePlatformAdmin();
  const enforce = formData.get('enforce') === 'true';
  if (enforce && formData.get('confirm') !== 'on') {
    done('Bitte bestaetigen, dass die Sperre eingeschaltet werden soll.', 'error');
  }
  const { error } = await supabase.rpc('platform_set_enforce_access', { p_enforce: enforce });
  if (error) done(dbMessage(error, 'Einstellung konnte nicht gespeichert werden.'), 'error');
  done(enforce ? 'Zugangssperre eingeschaltet.' : 'Zugangssperre ausgeschaltet.');
}
