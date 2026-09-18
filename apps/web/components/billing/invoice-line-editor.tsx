'use client';

import { useActionState } from 'react';
import { Trash2 } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Input } from '@/components/ui';
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
      {lines.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <caption className="sr-only">{t(locale, 'billing.lines')}</caption>
            <thead>
              <tr className="border-b text-start text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 text-start font-medium">{t(locale, 'common.note')}</th>
                <th className="py-2 text-end font-medium">{t(locale, 'billing.quantity')}</th>
                <th className="py-2 text-end font-medium">{t(locale, 'billing.unitPrice')}</th>
                <th className="py-2 text-end font-medium">{t(locale, 'billing.vatRate')}</th>
                <th className="py-2 text-end font-medium">{t(locale, 'billing.net')}</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {lines.map((line) => (
                <tr key={line.id}>
                  <td className="py-3 pe-3">{line.description}</td>
                  <td className="py-3 text-end tabular-nums">
                    {line.quantity} {line.unit}
                  </td>
                  <td className="py-3 text-end tabular-nums">
                    {formatMoney(locale, line.unit_price_cents, currency)}
                  </td>
                  <td className="py-3 text-end tabular-nums">
                    {formatPercent(locale, line.vat_rate_basis_points)}
                  </td>
                  <td className="py-3 text-end font-medium tabular-nums">
                    {formatMoney(locale, line.net_amount_cents, currency)}
                  </td>
                  <td className="py-3 ps-3 text-end">
                    <form
                      action={async () => {
                        await removeAction(line.id);
                      }}
                    >
                      <button
                        type="submit"
                        className="grid min-h-11 min-w-11 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-red-600"
                        aria-label={`${t(locale, 'common.cancel')}: ${line.description}`}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form action={formAction} className="space-y-4 rounded-md border bg-slate-50 p-4">
        <FormMessage status={state.status} message={state.message} />

        {billableJobs.length > 0 && (
          <label className="block text-sm font-medium">
            {t(locale, 'emp.tab.schedule')}
            <select
              className="mt-1.5 min-h-touch w-full rounded-md border bg-white px-3 text-sm"
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
                set('description', `${job.title} · ${job.object_name}`);
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
            </select>
            <span className="mt-1 block text-xs font-normal text-slate-500">
              Nur abgeschlossene, noch nicht abgerechnete Einsätze im Leistungszeitraum.
            </span>
          </label>
        )}

        <input type="hidden" name="cleaning_object_id" />
        <input type="hidden" name="service_schedule_id" />

        <label className="block text-sm font-medium">
          {t(locale, 'common.note')}
          <Input className="mt-1.5" name="description" maxLength={500} required />
        </label>

        <div className="grid gap-4 sm:grid-cols-4">
          <label className="text-sm font-medium">
            {t(locale, 'billing.quantity')}
            <Input
              className="mt-1.5"
              name="quantity"
              type="number"
              step="0.001"
              min="0.001"
              defaultValue="1"
              required
            />
          </label>
          <label className="text-sm font-medium">
            Einheit
            <Input className="mt-1.5" name="unit" defaultValue="Std" maxLength={20} />
          </label>
          <label className="text-sm font-medium">
            {t(locale, 'billing.unitPrice')}
            <Input
              className="mt-1.5"
              name="unit_price"
              type="number"
              step="0.01"
              min="0"
              required
            />
          </label>
          <label className="text-sm font-medium">
            {t(locale, 'billing.vatRate')} %
            <Input
              className="mt-1.5"
              name="vat_rate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              defaultValue="19"
              required
            />
          </label>
        </div>

        <SubmitButton locale={locale}>{t(locale, 'billing.lines')}</SubmitButton>
      </form>
    </div>
  );
}
