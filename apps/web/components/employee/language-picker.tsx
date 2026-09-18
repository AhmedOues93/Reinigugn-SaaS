'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FormMessage } from '@/components/form-controls';
import { initialFormState, type FormState } from '@/lib/actions';
import { Select } from '@/components/ui';
import { direction, localeLabelKeys, supportedLocales, t, type Locale } from '@/lib/i18n';

/**
 * Employees change their own app language. The action writes their employee
 * record through a narrow RPC and mirrors the choice into the locale cookie.
 */
export function EmployeeLanguagePicker({ locale, action }: { locale: Locale; action: (value: string) => Promise<FormState> }) {
  const router = useRouter();
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-4 space-y-3">
      <FormMessage status={state.status} message={state.message} />
      <label className="block">
        <span className="sr-only">{t(locale, 'common.language')}</span>
        <Select
          aria-label={t(locale, 'common.language')}
          defaultValue={locale}
          disabled={pending}
          onChange={(event) => {
            const next = event.target.value as Locale;
            startTransition(async () => {
              const result = await action(next);
              setState(result);
              if (result.status === 'success') {
                document.documentElement.lang = next;
                document.documentElement.dir = direction(next);
                router.refresh();
              }
            });
          }}
        >
          {supportedLocales.map((value) => (
            <option key={value} value={value}>
              {t(locale, localeLabelKeys[value])}
            </option>
          ))}
        </Select>
      </label>
    </div>
  );
}
