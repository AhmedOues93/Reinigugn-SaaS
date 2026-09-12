import { Card } from '@/components/ui';
import { requireStaffCompany } from '@/lib/auth';

export default async function SettingsPage() {
  const { membership, user } = await requireStaffCompany();
  const company = membership?.companies as unknown as { name: string; slug: string | null } | null;
  return <div className="mx-auto max-w-3xl"><div className="mb-8"><h1 className="text-2xl font-semibold tracking-tight">Einstellungen</h1><p className="mt-2 text-slate-600">Deine Unternehmens- und Kontoinformationen.</p></div><Card className="divide-y"><section className="p-5"><h2 className="font-medium">Unternehmen</h2><dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Firmenname</dt><dd className="mt-1 font-medium">{company?.name}</dd></div><div><dt className="text-slate-500">Rolle</dt><dd className="mt-1 font-medium">Inhaber</dd></div></dl></section><section className="p-5"><h2 className="font-medium">Konto</h2><p className="mt-2 text-sm text-slate-600">Angemeldet als {user.email}</p></section></Card></div>;
}
