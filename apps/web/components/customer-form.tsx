'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { type FormState, initialFormState } from '@/lib/actions';
import { Button, Input } from '@/components/ui';
import { FormMessage, SubmitButton } from '@/components/form-controls';

type CustomerRecord = { id?: string; name?: string | null; customer_number?: string | null; contact_person?: string | null; email?: string | null; phone?: string | null; billing_address?: string | null; city?: string | null; postal_code?: string | null; notes?: string | null; };
type CustomerAction = (state: FormState, formData: FormData) => Promise<FormState>;
const fieldClass = 'mt-1.5 flex h-10 w-full rounded-md border bg-white px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary';

export function CustomerForm({ customer, action, submitLabel }: { customer?: CustomerRecord; action: CustomerAction; submitLabel: string }) {
  const [state, formAction] = useActionState(action, initialFormState);
  const router = useRouter();
  useEffect(() => { if (state.status === 'success' && state.id) router.push(`/dashboard/kunden/${state.id}?success=${encodeURIComponent('Kunde wurde gespeichert.')}`); }, [router, state]);
  return <form action={formAction} className="space-y-7">
    <FormMessage status={state.status} message={state.message} />
    <section className="grid gap-5 sm:grid-cols-2"><label className="block text-sm font-medium sm:col-span-2">Kundenname <span className="text-red-700">*</span><Input className="mt-1.5" name="name" defaultValue={customer?.name ?? ''} maxLength={160} required /></label><label className="block text-sm font-medium">Kundennummer<Input className="mt-1.5" name="customer_number" defaultValue={customer?.customer_number ?? ''} maxLength={64} /></label><label className="block text-sm font-medium">Ansprechperson<Input className="mt-1.5" name="contact_person" defaultValue={customer?.contact_person ?? ''} maxLength={160} /></label><label className="block text-sm font-medium">E-Mail-Adresse<Input className="mt-1.5" name="email" type="email" defaultValue={customer?.email ?? ''} maxLength={254} /></label><label className="block text-sm font-medium">Telefon<Input className="mt-1.5" name="phone" type="tel" defaultValue={customer?.phone ?? ''} maxLength={64} /></label></section>
    <section className="border-t pt-6"><h2 className="font-semibold">Rechnungsadresse</h2><div className="mt-5 grid gap-5 sm:grid-cols-2"><label className="block text-sm font-medium sm:col-span-2">Adresse<Input className="mt-1.5" name="billing_address" defaultValue={customer?.billing_address ?? ''} maxLength={500} /></label><label className="block text-sm font-medium">Postleitzahl<Input className="mt-1.5" name="postal_code" defaultValue={customer?.postal_code ?? ''} maxLength={16} /></label><label className="block text-sm font-medium">Ort<Input className="mt-1.5" name="city" defaultValue={customer?.city ?? ''} maxLength={120} /></label></div></section>
    <section className="border-t pt-6"><label className="block text-sm font-medium">Notizen<textarea className={`${fieldClass} h-28 resize-y`} name="notes" defaultValue={customer?.notes ?? ''} maxLength={4000} /></label></section>
    <div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={() => router.back()}>Abbrechen</Button><SubmitButton>{submitLabel}</SubmitButton></div>
  </form>;
}
