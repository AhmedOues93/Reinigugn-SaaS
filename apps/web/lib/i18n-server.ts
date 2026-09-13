import { cookies } from 'next/headers';
import { isLocale, localeCookie } from '@/lib/i18n';

export async function cookieLocale() { const value = (await cookies()).get(localeCookie)?.value; return isLocale(value) ? value : null; }
export async function currentLocale() { return (await cookieLocale()) ?? 'de'; }
