import Link from 'next/link';
import { cookies } from 'next/headers';
import { invitationCookieName, type InvitationPreview } from '@/lib/invitations';
import { createClient } from '@/lib/supabase/server';
import { InvitationAcceptButton, InvitationSignUp } from '@/components/invitation-acceptance';

export default async function InvitationPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const token = (await cookies()).get(invitationCookieName)?.value;
  if (!token || error) return <main className="grid min-h-screen place-items-center bg-slate-50 p-4"><section className="w-full max-w-md rounded-xl border bg-white p-7 shadow-sm"><h1 className="text-xl font-semibold">Einladung nicht verfuegbar</h1><p className="mt-3 text-sm leading-6 text-slate-600">Der Einladungslink ist ungueltig, abgelaufen oder wurde bereits verwendet.</p><Link className="mt-6 inline-block text-sm font-medium text-teal-700 hover:underline" href="/login">Zur Anmeldung</Link></section></main>;
  const supabase = await createClient();
  const [{ data }, { data: { user } }] = await Promise.all([supabase.rpc('get_invitation_preview', { p_token: token }).maybeSingle(), supabase.auth.getUser()]);
  const preview = data as InvitationPreview | null;
  if (!preview) return <main className="grid min-h-screen place-items-center bg-slate-50 p-4"><section className="w-full max-w-md rounded-xl border bg-white p-7 shadow-sm"><h1 className="text-xl font-semibold">Einladung nicht verfuegbar</h1><p className="mt-3 text-sm leading-6 text-slate-600">Der Einladungslink ist ungueltig, abgelaufen oder wurde bereits verwendet.</p></section></main>;
  const name = `${preview.first_name} ${preview.last_name}`;
  const emailMatches = user?.email?.toLocaleLowerCase() === preview.email.toLocaleLowerCase();
  return <main className="grid min-h-screen place-items-center bg-slate-50 p-4"><section className="w-full max-w-md rounded-xl border bg-white p-7 shadow-sm"><p className="text-lg font-semibold tracking-tight">Sauber<span className="text-teal-700">Werk</span></p><h1 className="mt-7 text-2xl font-semibold">Willkommen, {name}</h1><p className="mt-2 text-sm leading-6 text-slate-600">Du wurdest als {preview.role === 'OFFICE' ? 'Buero' : 'Mitarbeiter'} zu <strong>{preview.company_name}</strong> eingeladen.</p><div className="mt-6 rounded-md bg-slate-50 p-4 text-sm"><p className="text-slate-500">Eingeladene E-Mail-Adresse</p><p className="mt-1 font-medium">{preview.email}</p></div><div className="mt-6">{user && emailMatches ? <InvitationAcceptButton /> : user ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">Du bist mit einer anderen E-Mail-Adresse angemeldet. Bitte melde dich mit {preview.email} an.</p> : <InvitationSignUp />}</div></section></main>;
}
