'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { type FormState, initialFormState } from '@/lib/actions';
import { Button, Input } from '@/components/ui';
import { FormMessage, SubmitButton } from '@/components/form-controls';

type ObjectRecord = { id?: string; customer_id?: string | null; name?: string | null; street?: string | null; postal_code?: string | null; city?: string | null; contact_person?: string | null; contact_phone?: string | null; access_instructions?: string | null; cleaning_instructions?: string | null; notes?: string | null; };
type CustomerOption = { id: string; name: string; customer_number: string | null; is_active: boolean };
type ObjectAction = (state: FormState, formData: FormData) => Promise<FormState>;
const textareaClass = 'mt-1.5 flex h-28 w-full rounded-md border bg-white px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary';

export function CleaningObjectForm({ object, customers, action, submitLabel }: { object?: ObjectRecord; customers: CustomerOption[]; action: ObjectAction; submitLabel: string }) {
  const [state, formAction] = useActionState(action, initialFormState);
  const router = useRouter();
  useEffect(() => { if (state.status === 'success' && state.id) router.push(`/dashboard/objekte/${state.id}?success=${encodeURIComponent('Objekt wurde gespeichert.')}`); }, [router, state]);
  return <form action={formAction} className="space-y-7"><FormMessage status={state.status} message={state.message} />
    <section className="grid gap-5 sm:grid-cols-2"><label className="block text-sm font-medium sm:col-span-2">Kunde <span className="text-red-700">*</span><select className="mt-1.5 flex h-10 w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" name="customer_id" defaultValue={object?.customer_id ?? ''} required><option value="" disabled>Kunde auswaehlen</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.customer_number ? ` (${customer.customer_number})` : ''}{customer.is_active ? '' : ' - archiviert'}</option>)}</select></label><label className="block text-sm font-medium sm:col-span-2">Objektname <span className="text-red-700">*</span><Input className="mt-1.5" name="name" defaultValue={object?.name ?? ''} maxLength={160} required /></label></section>
    <section className="border-t pt-6"><h2 className="font-semibold">Adresse</h2><div className="mt-5 grid gap-5 sm:grid-cols-2"><label className="block text-sm font-medium sm:col-span-2">Strasse und Hausnummer<Input className="mt-1.5" name="street" defaultValue={object?.street ?? ''} maxLength={240} /></label><label className="block text-sm font-medium">Postleitzahl<Input className="mt-1.5" name="postal_code" defaultValue={object?.postal_code ?? ''} maxLength={16} /></label><label className="block text-sm font-medium">Ort<Input className="mt-1.5" name="city" defaultValue={object?.city ?? ''} maxLength={120} /></label></div></section>
    <section className="border-t pt-6"><h2 className="font-semibold">Kontakt vor Ort</h2><div className="mt-5 grid gap-5 sm:grid-cols-2"><label className="block text-sm font-medium">Ansprechperson<Input className="mt-1.5" name="contact_person" defaultValue={object?.contact_person ?? ''} maxLength={160} /></label><label className="block text-sm font-medium">Telefon<Input className="mt-1.5" name="contact_phone" type="tel" defaultValue={object?.contact_phone ?? ''} maxLength={64} /></label></div></section>
    <section className="grid gap-5 border-t pt-6"><label className="block text-sm font-medium">Zugangshinweise<textarea className={textareaClass} name="access_instructions" defaultValue={object?.access_instructions ?? ''} maxLength={4000} /></label><label className="block text-sm font-medium">Reinigungsanweisungen<textarea className={textareaClass} name="cleaning_instructions" defaultValue={object?.cleaning_instructions ?? ''} maxLength={4000} /></label><label className="block text-sm font-medium">Notizen<textarea className={textareaClass} name="notes" defaultValue={object?.notes ?? ''} maxLength={4000} /></label></section>
    <div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={() => router.back()}>Abbrechen</Button><SubmitButton>{submitLabel}</SubmitButton></div>
  </form>;
}
