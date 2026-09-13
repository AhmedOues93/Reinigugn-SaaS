'use server';
import { cookies } from 'next/headers';
import { isLocale, localeCookie } from '@/lib/i18n';

export async function setLocale(value: string) {
  if (!isLocale(value)) return { error: 'Ungültige Sprache.' };
  (await cookies()).set(localeCookie, value, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
  return { error: null };
}
