'use client';

import { useActionState } from 'react';
import { Trash2 } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Field, Input } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';
import { calculateArea } from '@/lib/sales-calc';
import { formatMoney } from '@/lib/format';
import { t, type Locale } from '@/lib/i18n';

type Area = {
  id: string;
  position: number;
  name: string;
  area_sqm: number | null;
  floor_type: string | null;
  services_per_week: number;
  minutes_per_service: number;
  hourly_rate_cents: number | null;
};

/**
 * The Kalkulation. Minutes and the hourly rate are the only inputs; hours and
 * price are derived here for preview using the same arithmetic the database
 * applies when the quote is generated, so the two can never disagree.
 */
export function SurveyAreaEditor({
  locale,
  areas,
  fallbackRateCents,
  editable,
  addAction,
  removeAction,
}: {
  locale: Locale;
  areas: Area[];
  fallbackRateCents: number | null;
  editable: boolean;
  addAction: (state: FormState, formData: FormData) => Promise<FormState>;
  removeAction: (areaId: string) => Promise<void>;
}) {
  const [state, formAction] = useActionState(addAction, initialFormState);
  const monthlyTotal = areas.reduce((total, area) => total + (calculateArea(area, fallbackRateCents).monthlyNetCents ?? 0), 0);

  return (
    <div className="space-y-6">
      {areas.length > 0 && (
        <>
          <ul className="space-y-3">
            {areas.map((area) => {
              const calc = calculateArea(area, fallbackRateCents);
              return (
                <li key={area.id} className="rounded-md border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{area.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {[
                          area.area_sqm ? `${area.area_sqm} m²` : null,
                          area.floor_type,
                          `${area.services_per_week}×/${t(locale, 'sales.area.perWeek')}`,
                          `${area.minutes_per_service} min`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    {editable && (
                      <form
                        action={async () => {
                          await removeAction(area.id);
                        }}
                      >
                        <button
                          type="submit"
                          aria-label={`${t(locale, 'common.cancel')}: ${area.name}`}
                          className="grid min-h-touch min-w-touch place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-danger"
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      </form>
                    )}
                  </div>
                  <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-3 text-sm">
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">{t(locale, 'sales.area.rate')}</dt>
                      <dd className="tabular-nums">
                        {calc.rateCents === null ? '—' : formatMoney(locale, calc.rateCents)}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">{t(locale, 'billing.net')}</dt>
                      <dd className="font-medium tabular-nums">
                        {calc.netCents === null ? '—' : formatMoney(locale, calc.netCents)}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">{t(locale, 'sales.quote.monthly')}</dt>
                      <dd className="font-medium tabular-nums">
                        {calc.monthlyNetCents === null ? '—' : formatMoney(locale, calc.monthlyNetCents)}
                      </dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ul>
          <p className="flex items-baseline justify-between gap-4 border-t border-border pt-4 text-sm">
            <span className="font-medium">{t(locale, 'sales.quote.monthly')}</span>
            <span className="text-lg font-semibold tabular-nums">{formatMoney(locale, monthlyTotal)}</span>
          </p>
        </>
      )}

      {editable && (
        <form action={formAction} className="space-y-4 rounded-md border border-border bg-muted/50 p-4">
          <FormMessage status={state.status} message={state.message} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t(locale, 'sales.area.name')} htmlFor="area-name">
              <Input id="area-name" name="name" required maxLength={160} />
            </Field>
            <Field label={t(locale, 'sales.area.sqm')} htmlFor="area-sqm">
              <Input id="area-sqm" name="area_sqm" type="number" step="0.01" min="0" />
            </Field>
            <Field label={t(locale, 'sales.area.floor')} htmlFor="area-floor">
              <Input id="area-floor" name="floor_type" maxLength={120} />
            </Field>
            <Field label={t(locale, 'sales.area.perWeek')} htmlFor="area-week">
              <Input id="area-week" name="services_per_week" type="number" step="0.25" min="0.25" max="21" defaultValue="1" required />
            </Field>
            <Field label={t(locale, 'sales.area.minutes')} htmlFor="area-minutes">
              <Input id="area-minutes" name="minutes_per_service" type="number" step="1" min="1" max="10000" required />
            </Field>
            <Field
              label={t(locale, 'sales.area.rate')}
              hint={fallbackRateCents === null ? undefined : `${t(locale, 'sales.hourlyRate')}: ${formatMoney(locale, fallbackRateCents)}`}
              htmlFor="area-rate"
            >
              <Input id="area-rate" name="hourly_rate" type="number" step="0.01" min="0" />
            </Field>
          </div>
          <SubmitButton locale={locale}>{t(locale, 'sales.area.add')}</SubmitButton>
        </form>
      )}
    </div>
  );
}
