'use client';

import { useActionState } from 'react';
import { Trash2 } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Badge, Field, Input, Select } from '@/components/ui';
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
  recurrence: string;
  net_amount_cents: number;
};

/**
 * Amounts shown here were all computed by the database; the form only sends
 * quantity, unit price, VAT rate and recurrence.
 */
export function QuoteLineEditor({
  locale,
  currency,
  lines,
  editable,
  addAction,
  removeAction,
}: {
  locale: Locale;
  currency: string;
  lines: Line[];
  editable: boolean;
  addAction: (state: FormState, formData: FormData) => Promise<FormState>;
  removeAction: (lineId: string) => Promise<void>;
}) {
  const [state, formAction] = useActionState(addAction, initialFormState);

  return (
    <div className="space-y-6">
      <ul className="space-y-3">
        {lines.map((line) => (
          <li key={line.id} className="rounded-md border border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-anywhere font-medium">{line.description}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <Badge tone={line.recurrence === 'ONE_OFF' ? 'neutral' : 'primary'}>
                    {t(locale, `sales.recurrence.${line.recurrence}`)}
                  </Badge>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {line.quantity} {line.unit} × {formatMoney(locale, line.unit_price_cents, currency)} ·{' '}
                    {formatPercent(locale, line.vat_rate_basis_points)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold tabular-nums">{formatMoney(locale, line.net_amount_cents, currency)}</span>
                {editable && (
                  <form
                    action={async () => {
                      await removeAction(line.id);
                    }}
                  >
                    <button
                      type="submit"
                      aria-label={`${t(locale, 'common.cancel')}: ${line.description}`}
                      className="grid min-h-touch min-w-touch place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-danger"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </form>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {editable && (
        <form action={formAction} className="space-y-4 rounded-md border border-border bg-muted/50 p-4">
          <FormMessage status={state.status} message={state.message} />
          <Field label={t(locale, 'common.note')} htmlFor="line-description">
            <Input id="line-description" name="description" required maxLength={500} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Field label={t(locale, 'billing.quantity')} htmlFor="line-quantity">
              <Input id="line-quantity" name="quantity" type="number" step="0.001" min="0.001" defaultValue="1" required />
            </Field>
            <Field label="Einheit" htmlFor="line-unit">
              <Input id="line-unit" name="unit" defaultValue="Std" maxLength={20} />
            </Field>
            <Field label={t(locale, 'billing.unitPrice')} htmlFor="line-price">
              <Input id="line-price" name="unit_price" type="number" step="0.01" min="0" required />
            </Field>
            <Field label={`${t(locale, 'billing.vatRate')} %`} htmlFor="line-vat">
              <Input id="line-vat" name="vat_rate" type="number" step="0.01" min="0" max="100" defaultValue="19" required />
            </Field>
            <Field label={t(locale, 'sales.quote.recurrence')} htmlFor="line-recurrence">
              <Select id="line-recurrence" name="recurrence" defaultValue="ONE_OFF">
                <option value="ONE_OFF">{t(locale, 'sales.recurrence.ONE_OFF')}</option>
                <option value="WEEKLY">{t(locale, 'sales.recurrence.WEEKLY')}</option>
                <option value="MONTHLY">{t(locale, 'sales.recurrence.MONTHLY')}</option>
              </Select>
            </Field>
          </div>
          <SubmitButton locale={locale}>{t(locale, 'billing.lines')}</SubmitButton>
        </form>
      )}
    </div>
  );
}
