'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, Field, Input, Select } from '@/components/ui';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { initialFormState, type FormState } from '@/lib/actions';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;
type Job = { id: string; cleaning_object_id: string; title: string; scheduled_date: string };

export function QualityInspectionForm({ objects, jobs, action }: { objects: { id: string; name: string }[]; jobs: Job[]; action: Action }) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [objectId, setObjectId] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const relevantJobs = useMemo(() => jobs.filter((job) => !objectId || job.cleaning_object_id === objectId), [jobs, objectId]);

  useEffect(() => { if (state.status === 'success') router.push('/dashboard/qualitaetskontrolle'); }, [router, state]);

  function nextStep() {
    const container = formRef.current?.querySelector<HTMLElement>(`[data-step="${step}"]`);
    const fields = Array.from(container?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea') ?? []);
    const invalid = fields.find((field) => !field.checkValidity());
    if (invalid) { invalid.reportValidity(); return; }
    setStep(2);
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <FormMessage status={state.status} message={state.message} />
      <div className="rounded-xl border border-border bg-muted/25 p-3"><div className="grid grid-cols-2 gap-2 text-center text-xs font-medium"><span className={step === 1 ? 'text-primary' : 'text-muted-foreground'}>1. Objekt</span><span className={step === 2 ? 'text-primary' : 'text-muted-foreground'}>2. Ergebnis</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border"><div className="h-full bg-primary transition-all" style={{ width: step === 1 ? '50%' : '100%' }} /></div></div>
      <div data-step="1" className={step === 1 ? 'grid gap-5 sm:grid-cols-2' : 'hidden'}>
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
      </div>
      <div data-step="2" className={step === 2 ? 'grid gap-5 sm:grid-cols-2' : 'hidden'}>
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
      <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-xl border border-border bg-card/95 p-3 shadow-popover backdrop-blur">
        <Button type="button" variant="outline" onClick={() => step === 1 ? router.back() : setStep(1)}>{step === 1 ? 'Abbrechen' : <><ChevronLeft className="size-4" />Zurück</>}</Button>
        {step === 1 ? <Button type="button" onClick={nextStep}>Weiter<ChevronRight className="size-4" /></Button> : <SubmitButton>Kontrolle speichern</SubmitButton>}
      </div>
    </form>
  );
}
