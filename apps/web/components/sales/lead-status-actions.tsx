'use client';

import { useActionState, useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Button, Field, Input, Select } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';
import { t, type Locale } from '@/lib/i18n';

export function LeadStatusActions({
  action,
  locale,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  locale: Locale;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [status, setStatus] = useState('CONTACTED');
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <Button type="button" variant="outline" onClick={() => setEditing(true)}>
        <Pencil className="size-4" aria-hidden="true" />
        Bearbeiten
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage status={state.status} message={state.message} />
      <Field label={t(locale, 'common.status')} htmlFor="lead-status">
        <Select id="lead-status" name="status" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="CONTACTED">{t(locale, 'sales.status.CONTACTED')}</option>
          <option value="LOST">{t(locale, 'sales.status.LOST')}</option>
        </Select>
      </Field>
      {status === 'LOST' && (
        <Field label={t(locale, 'sales.lead.lostReason')} htmlFor="lost-reason">
          <Input id="lost-reason" name="lost_reason" required minLength={3} maxLength={500} />
        </Field>
      )}
      <div className="flex flex-wrap gap-2">
        <SubmitButton locale={locale} variant={status === 'LOST' ? 'danger' : 'default'}>
          {status === 'LOST' ? t(locale, 'sales.lead.markLost') : t(locale, 'common.save')}
        </SubmitButton>
        <Button type="button" variant="outline" onClick={() => setEditing(false)}>
          <X className="size-4" aria-hidden="true" />
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
