'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { initialFormState, type FormState } from '@/lib/actions';

type Profile = { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
type Options = { customers: { id: string; name: string }[]; objects: { id: string; customer_id: string; name: string }[]; jobs: { id: string; customer_id: string; cleaning_object_id: string; title: string; scheduled_date: string }[]; employees: { id: string; profiles: Profile }[] };
type Complaint = { id?: string; customer_id?: string; cleaning_object_id?: string; job_id?: string | null; title?: string; description?: string; priority?: string; status?: string; assigned_member_id?: string | null; due_date?: string | null; internal_note?: string | null };
type Action = (state: FormState, formData: FormData) => Promise<FormState>;
function first<T>(value: T | T[] | null) { return Array.isArray(value) ? value[0] ?? null : value; }
function name(profile: Profile) { const person = first(profile); return [person?.first_name, person?.last_name].filter(Boolean).join(' ') || 'Mitarbeiter'; }

export function ComplaintForm({ complaint, options, action, submitLabel }: { complaint?: Complaint; options: Options; action: Action; submitLabel: string }) {
  const [state, formAction] = useActionState(action, initialFormState); const router = useRouter(); const [editing, setEditing] = useState(!complaint?.id);
  useEffect(() => { if (state.status === 'success' && state.id) { if (complaint?.id) { setEditing(false); router.refresh(); } else router.push(`/dashboard/reklamationen/${state.id}?success=${encodeURIComponent('Reklamation wurde gespeichert.')}`); } }, [complaint?.id, router, state]);
  if (complaint?.id && !editing) {
    const customer = options.customers.find((item) => item.id === complaint.customer_id);
    const object = options.objects.find((item) => item.id === complaint.cleaning_object_id);
    const statusLabel: Record<string, string> = { OPEN: 'Offen', IN_PROGRESS: 'In Bearbeitung', RESOLVED: 'Gelöst', CLOSED: 'Geschlossen' };
    const priorityLabel: Record<string, string> = { LOW: 'Niedrig', NORMAL: 'Normal', HIGH: 'Hoch', URGENT: 'Dringend' };
    const status = complaint.status ?? 'OPEN';
    const priority = complaint.priority ?? 'NORMAL';
    const assignee = complaint.assigned_member_id
      ? name(options.employees.find((employee) => employee.id === complaint.assigned_member_id)?.profiles ?? null)
      : null;

    return (
      <div className="space-y-4">
        <FormMessage status={state.status} message={state.message} />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary">{statusLabel[status] ?? status}</span>
              <span className={priority === 'URGENT' || priority === 'HIGH'
                ? 'rounded-full bg-danger/10 px-2.5 py-1 text-xs font-semibold text-danger'
                : 'rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground'}>
                {priorityLabel[priority] ?? priority}
              </span>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="size-4" />
            Bearbeiten
          </Button>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Kundenmeldung</p>
          <p className="break-anywhere mt-2 text-sm font-semibold">{complaint.title}</p>
          <p className="break-anywhere mt-2 whitespace-pre-wrap text-[15px] leading-6 text-foreground">
            {complaint.description || '—'}
          </p>
        </div>

        <div className="grid gap-3 rounded-xl bg-subtle p-4 sm:grid-cols-2">
          <div className="min-w-0"><p className="text-xs text-muted-foreground">Kunde</p><p className="break-anywhere mt-0.5 font-medium">{customer?.name ?? '—'}</p></div>
          <div className="min-w-0"><p className="text-xs text-muted-foreground">Objekt</p><p className="break-anywhere mt-0.5 font-medium">{object?.name ?? '—'}</p></div>
        </div>

        {(complaint.assigned_member_id || complaint.due_date || complaint.internal_note) && (
          <details className="rounded-lg border border-border/80">
            <summary className="min-h-touch cursor-pointer list-none px-4 py-3 text-sm font-medium">Interne Bearbeitung</summary>
            <dl className="grid gap-3 border-t border-border/80 p-4 text-sm sm:grid-cols-2">
              {assignee && <div className="min-w-0"><dt className="text-xs text-muted-foreground">Zugewiesen</dt><dd className="break-anywhere mt-0.5">{assignee}</dd></div>}
              {complaint.due_date && <div><dt className="text-xs text-muted-foreground">Fällig</dt><dd className="mt-0.5">{complaint.due_date}</dd></div>}
              {complaint.internal_note && <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Interne Notiz</dt><dd className="mt-0.5 whitespace-pre-wrap">{complaint.internal_note}</dd></div>}
            </dl>
          </details>
        )}
      </div>
    );
  }

  const customer = options.customers.find((item) => item.id === complaint?.customer_id);
  const object = options.objects.find((item) => item.id === complaint?.cleaning_object_id);

  return <form action={formAction} className="space-y-5"><FormMessage status={state.status} message={state.message} />
    {complaint?.id ? (
      <>
        <input type="hidden" name="customer_id" value={complaint.customer_id ?? ''} />
        <input type="hidden" name="cleaning_object_id" value={complaint.cleaning_object_id ?? ''} />
        <div className="grid gap-3 rounded-lg bg-subtle p-4 sm:grid-cols-2">
          <div><p className="text-xs text-muted-foreground">Kunde</p><p className="mt-0.5 font-medium">{customer?.name ?? '—'}</p></div>
          <div><p className="text-xs text-muted-foreground">Objekt</p><p className="mt-0.5 font-medium">{object?.name ?? '—'}</p></div>
        </div>
      </>
    ) : (
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">Kunde <span className="text-danger">*</span><select className="mt-1.5 min-h-touch w-full rounded-md border bg-card px-3 text-sm" name="customer_id" defaultValue={complaint?.customer_id ?? ''} required><option value="" disabled>Kunde auswählen</option>{options.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
        <label className="block text-sm font-medium">Objekt <span className="text-danger">*</span><select className="mt-1.5 min-h-touch w-full rounded-md border bg-card px-3 text-sm" name="cleaning_object_id" defaultValue={complaint?.cleaning_object_id ?? ''} required><option value="" disabled>Objekt auswählen</option>{options.objects.map((object) => <option key={object.id} value={object.id}>{object.name}</option>)}</select></label>
      </div>
    )}

    <div className="space-y-4">
      <label className="block text-sm font-medium">Titel <span className="text-danger">*</span><Input className="mt-1.5" name="title" defaultValue={complaint?.title ?? ''} maxLength={160} required /></label>
      <label className="block text-sm font-medium">Beschreibung <span className="text-danger">*</span><textarea className="mt-1.5 min-h-28 w-full rounded-md border bg-card px-3 py-2 text-sm" name="description" defaultValue={complaint?.description ?? ''} maxLength={4000} required /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">Priorität<select className="mt-1.5 min-h-touch w-full rounded-md border bg-card px-3 text-sm" name="priority" defaultValue={complaint?.priority ?? 'NORMAL'}><option value="LOW">Niedrig</option><option value="NORMAL">Normal</option><option value="HIGH">Hoch</option><option value="URGENT">Dringend</option></select></label>
        <label className="block text-sm font-medium">Status<select className="mt-1.5 min-h-touch w-full rounded-md border bg-card px-3 text-sm" name="status" defaultValue={complaint?.status ?? 'OPEN'}><option value="OPEN">Offen</option><option value="IN_PROGRESS">In Bearbeitung</option><option value="RESOLVED">Gelöst</option><option value="CLOSED">Geschlossen</option></select></label>
      </div>
    </div>

    <details className="group rounded-lg border border-border/80">
      <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between px-4 text-sm font-medium">
        Weitere Angaben
        <span className="text-xs font-normal text-muted-foreground">optional</span>
      </summary>
      <div className="grid gap-4 border-t border-border/80 p-4 sm:grid-cols-2">
        <label className="block text-sm font-medium sm:col-span-2">Auftrag<select className="mt-1.5 min-h-touch w-full rounded-md border bg-card px-3 text-sm" name="job_id" defaultValue={complaint?.job_id ?? ''}><option value="">Kein Auftrag verknüpft</option>{options.jobs.map((job) => <option key={job.id} value={job.id}>{job.scheduled_date}: {job.title}</option>)}</select></label>
        <label className="block text-sm font-medium">Zugewiesener Mitarbeiter<select className="mt-1.5 min-h-touch w-full rounded-md border bg-card px-3 text-sm" name="assigned_member_id" defaultValue={complaint?.assigned_member_id ?? ''}><option value="">Nicht zugewiesen</option>{options.employees.map((employee) => <option key={employee.id} value={employee.id}>{name(employee.profiles)}</option>)}</select></label>
        <label className="block text-sm font-medium">Fällig am<Input className="mt-1.5" name="due_date" type="date" defaultValue={complaint?.due_date ?? ''} /></label>
        <label className="block text-sm font-medium sm:col-span-2">Interne Notiz<textarea className="mt-1.5 min-h-20 w-full rounded-md border bg-card px-3 py-2 text-sm" name="internal_note" defaultValue={complaint?.internal_note ?? ''} maxLength={4000} /></label>
      </div>
    </details>

    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => complaint?.id ? setEditing(false) : router.back()}>Abbrechen</Button><SubmitButton>{submitLabel}</SubmitButton></div>
  </form>;
}
