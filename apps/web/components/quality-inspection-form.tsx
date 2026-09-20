'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Select } from '@/components/ui';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { initialFormState, type FormState } from '@/lib/actions';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;
type Job = { id: string; cleaning_object_id: string; title: string; scheduled_date: string };

export function QualityInspectionForm({ objects, jobs, action }: { objects: { id: string; name: string }[]; jobs: Job[]; action: Action }) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [objectId, setObjectId] = useState('');
  const router = useRouter();
  const relevantJobs = useMemo(() => jobs.filter((job) => !objectId || job.cleaning_object_id === objectId), [jobs, objectId]);

  useEffect(() => { if (state.status === 'success') router.push('/dashboard/qualitaetskontrolle'); }, [router, state]);

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage status={state.status} message={state.message} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Objekt *" htmlFor="quality-object">
          <Select id="quality-object" name="cleaning_object_id" required value={objectId} onChange={(event) => setObjectId(event.target.value)}>
            <option value="" disabled>Objekt auswählen</option>
            {objects.map((object) => <option key={object.id} value={object.id}>{object.name}</option>)}
          </Select>
        </Field>
        <Field label="Einsatz" htmlFor="quality-job" optional info="Nur verknüpfen, wenn die Kontrolle zu einem konkreten Einsatz gehört.">
          <Select id="quality-job" name="job_id" defaultValue="">
            <option value="">Keine Einsatzverknüpfung</option>
            {relevantJobs.map((job) => <option key={job.id} value={job.id}>{job.scheduled_date} · {job.title}</option>)}
          </Select>
        </Field>
        <Field label="Prüfdatum *" htmlFor="quality-date">
          <Input id="quality-date" name="inspected_at" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
        </Field>
        <Field label="Ergebnis" htmlFor="quality-result">
          <Select id="quality-result" name="result" defaultValue="PASS">
            <option value="PASS">Bestanden</option>
            <option value="FAIL">Nicht bestanden</option>
          </Select>
        </Field>
        <Field label="Bewertung" htmlFor="quality-score" optional info="0 bis 100 Punkte. Leer lassen, wenn nur bestanden/nicht bestanden dokumentiert wird.">
          <Input id="quality-score" name="score" type="number" min="0" max="100" placeholder="z. B. 92" />
        </Field>
        <label className="flex min-h-touch items-center gap-3 self-end rounded-lg border border-border/80 bg-subtle/50 px-3.5 py-2.5 text-sm font-medium">
          <input name="follow_up_required" type="checkbox" className="size-4 accent-primary" />
          Nacharbeit erforderlich
        </label>
        <Field label="Prüfkriterien" htmlFor="quality-criteria" optional info="Eine Zeile pro geprüftem Punkt." className="sm:col-span-2">
          <textarea id="quality-criteria" className="min-h-24 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" name="criteria" maxLength={4000} placeholder={'Sanitärbereiche\nBodenflächen\nKontaktflächen'} />
        </Field>
        <Field label="Notizen" htmlFor="quality-notes" optional className="sm:col-span-2">
          <textarea id="quality-notes" className="min-h-24 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" name="notes" maxLength={4000} placeholder="Abweichungen, Vereinbarungen oder Hinweise dokumentieren" />
        </Field>
      </div>
      <div className="flex justify-end gap-3 border-t border-border/80 pt-5">
        <Button type="button" variant="ghost" onClick={() => router.back()}>Abbrechen</Button>
        <SubmitButton>Kontrolle speichern</SubmitButton>
      </div>
    </form>
  );
}
