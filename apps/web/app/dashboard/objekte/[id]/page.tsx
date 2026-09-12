import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Pencil } from 'lucide-react';
import { getCleaningObject } from '@/lib/data/cleaning-objects';
import { Button, Card } from '@/components/ui';
import { StatusBadge } from '@/components/status-badge';
import { StatusToggle } from '@/components/status-toggle';
import { setCleaningObjectActive } from '../actions';

function Info({ label, value }: { label: string; value?: string | null }) { return <div><dt className="text-sm text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-sm font-medium text-slate-800">{value || '—'}</dd></div>; }

export default async function ObjectDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ success?: string }> }) {
  const { id } = await params; const { success } = await searchParams;
  const object = await getCleaningObject(id); if (!object) notFound();
  const customer = object.customers as unknown as { id: string; name: string } | null;
  return <div className="mx-auto max-w-5xl"><Link href="/dashboard/objekte" className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-teal-700"><ArrowLeft className="size-4" />Zurueck zu Objekten</Link>{success && <p className="mb-5 rounded-md bg-teal-50 p-3 text-sm text-teal-800">{success}</p>}<div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-3"><h1 className="text-2xl font-semibold tracking-tight">{object.name}</h1><StatusBadge isActive={object.is_active} /></div><p className="mt-2 text-sm text-slate-600">Kunde: {customer ? <Link className="font-medium text-teal-700 hover:underline" href={`/dashboard/kunden/${customer.id}`}>{customer.name}</Link> : '—'}</p></div><div className="flex flex-wrap gap-3"><Link href={`/dashboard/objekte/${object.id}/bearbeiten`}><Button variant="outline"><Pencil className="mr-2 size-4" />Bearbeiten</Button></Link><StatusToggle id={object.id} isActive={object.is_active} noun="Objekt" action={setCleaningObjectActive} /></div></div>
    <div className="grid gap-5 lg:grid-cols-2"><Card className="p-5"><h2 className="font-semibold">Adresse</h2><dl className="mt-5 grid gap-5"><Info label="Strasse und Hausnummer" value={object.street} /><div className="grid gap-5 sm:grid-cols-2"><Info label="Postleitzahl" value={object.postal_code} /><Info label="Ort" value={object.city} /></div></dl></Card><Card className="p-5"><h2 className="font-semibold">Kontakt vor Ort</h2><dl className="mt-5 grid gap-5 sm:grid-cols-2"><Info label="Ansprechperson" value={object.contact_person} /><Info label="Telefon" value={object.contact_phone} /></dl></Card><Card className="p-5"><h2 className="font-semibold">Zugangshinweise</h2><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{object.access_instructions || 'Keine Zugangshinweise hinterlegt.'}</p></Card><Card className="p-5"><h2 className="font-semibold">Reinigungsanweisungen</h2><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{object.cleaning_instructions || 'Keine Reinigungsanweisungen hinterlegt.'}</p></Card><Card className="p-5 lg:col-span-2"><h2 className="font-semibold">Notizen</h2><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{object.notes || 'Keine Notizen hinterlegt.'}</p></Card></div>
  </div>;
}
