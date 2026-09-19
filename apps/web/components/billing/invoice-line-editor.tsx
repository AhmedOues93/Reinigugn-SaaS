'use client';

import { useActionState } from 'react';
import { Trash2 } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Field, Input, Select } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';
import { formatMoney, formatPercent } from '@/lib/format';
import { t, type Locale } from '@/lib/i18n';

type Line = {
  id: string;
  position: number;
  description: string;
  quantity: number;
  unit: string;
  unit_price_cents: number;
  vat_rate_basis_points: number;
  net_amount_cents: number;
  vat_amount_cents: number;
  gross_amount_cents: number;
};

type BillableJob = {
  job_id: string;
  scheduled_date: string;
  title: string;
  object_id: string;
  object_name: string;
  duration_minutes: number;
  service_schedule_id: string | null;
  suggested_unit_price_cents: number | null;
  suggested_vat_rate_basis_points: number | null;
};

/**
 * The editor sends quantity, unit price and VAT rate only. Every amount shown
 * here was computed by the database, so the screen cannot disagree with the books.
 */
export function InvoiceLineEditor({
  locale,
  currency,
  lines,
  billableJobs,
  addAction,
  removeAction,
}: {
  locale: Locale;
  currency: string;
  lines: Line[];
  billableJobs: BillableJob[];
  addAction: (state: FormState, formData: FormData) => Promise<FormState>;
  removeAction: (lineId: string) => Promise<void>;
}) {
  const [state, formAction] = useActionState(addAction, initialFormState);

  return (
    <div className="space-y-6">
      <ul className={lines.length ? 'space-y-2' : 'hidden'}>
        {lines.map((line) => (
          <li key={line.id} className="rounded-lg border border-border/80 bg-card p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-anywhere font-medium">{line.description}</p>
                <span className="mt-1.5 block text-sm text-muted-foreground tabular-nums">
                  {line.quantity} {line.unit} × {formatMoney(locale, line.unit_price_cents, currency)} ·{' '}
                  {formatPercent(locale, line.vat_rate_basis_points)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold tabular-nums">{formatMoney(locale, line.net_amount_cents, currency)}</span>
                <form
                  action={async () => {
                    await removeAction(line.id);
                  }}
                >
                  <button
                    type="submit"
                    aria-label={`Position entfernen: ${line.description}`}
                    className="grid min-h-touch min-w-touch place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-danger"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </form>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <form action={formAction} className="space-y-4 rounded-xl border border-dashed border-foreground/15 bg-subtle p-4">
        <FormMessage status={state.status} message={state.message} />

        {billableJobs.length > 0 && (
          <Field
            label="Einsatz übernehmen"
            htmlFor="line-job"
            optional
            info="Nur abgeschlossene, noch nicht abgerechnete Einsätze im Leistungszeitraum. Beschreibung, Stunden und vereinbarter Preis werden vorausgefüllt."
          >
            <Select
              id="line-job"
              name="job_id"
              defaultValue=""
              onChange={(event) => {
                const job = billableJobs.find((entry) => entry.job_id === event.target.value);
                const form = event.target.form;
                if (!form) return;
                const set = (name: string, value: string) => {
                  const field = form.elements.namedItem(name);
                  if (field instanceof HTMLInputElement) field.value = value;
                };
                if (!job) return;
                set('description', job.title.includes(job.object_name) ? `${job.title} · ${job.scheduled_date}` : `${job.title} · ${job.object_name}`);
                if (job.duration_minutes > 0)
                  set('quantity', (job.duration_minutes / 60).toFixed(2));
                if (job.suggested_unit_price_cents)
                  set('unit_price', (job.suggested_unit_price_cents / 100).toFixed(2));
                if (job.suggested_vat_rate_basis_points)
                  set('vat_rate', (job.suggested_vat_rate_basis_points / 100).toFixed(2));
                const objectField = form.elements.namedItem('cleaning_object_id');
                if (objectField instanceof HTMLInputElement) objectField.value = job.object_id;
                const scheduleField = form.elements.namedItem('service_schedule_id');
                if (scheduleField instanceof HTMLInputElement)
                  scheduleField.value = job.service_schedule_id ?? '';
              }}
            >
              <option value="">{t(locale, 'common.none')}</option>
              {billableJobs.map((job) => (
                <option key={job.job_id} value={job.job_id}>
                  {job.scheduled_date} · {job.object_name} · {job.title}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <input type="hidden" name="cleaning_object_id" />
        <input type="hidden" name="service_schedule_id" />

        <Field label="Beschreibung" htmlFor="line-description">
          <Input id="line-description" name="description" maxLength={500} required />
        </Field>

        <div className="grid gap-4 sm:grid-cols-4">
          <Field label={t(locale, 'billing.quantity')} htmlFor="line-quantity">
            <Input
              id="line-quantity"
              name="quantity"
              type="number"
              step="0.001"
              min="0.001"
              defaultValue="1"
              required
            />
          </Field>
          <Field label="Einheit" htmlFor="line-unit">
            <Input id="line-unit" name="unit" defaultValue="Std" maxLength={20} />
          </Field>
          <Field label={t(locale, 'billing.unitPrice')} htmlFor="line-price">
            <Input id="line-price" name="unit_price" type="number" step="0.01" min="0" required />
          </Field>
          <Field label={`${t(locale, 'billing.vatRate')} %`} htmlFor="line-vat" info="Regelsatz 19 %. Für steuerfreie oder abweichende Leistungen den Satz anpassen; die Beträge berechnet die Datenbank.">
            <Input
              id="line-vat"
              name="vat_rate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              defaultValue="19"
              required
            />
          </Field>
        </div>

        <SubmitButton locale={locale} variant="outline">
          Position hinzufügen
        </SubmitButton>
      </form>
    </div>
  );
}
