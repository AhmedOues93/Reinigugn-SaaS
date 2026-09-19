'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/employee/avatar';
import { FormMessage } from '@/components/form-controls';
import { Button } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';
import { t, type Locale } from '@/lib/i18n';

const allowed = ['image/png', 'image/jpeg', 'image/webp'];
const maxBytes = 2 * 1024 * 1024;

/**
 * Upload, replace or remove the employee's own avatar. Type and size are
 * checked here for a fast answer and again in the action and the storage policy,
 * which are the ones that actually decide.
 */
export function AvatarForm({
  locale,
  url,
  initials,
  uploadAction,
  removeAction,
}: {
  locale: Locale;
  url: string | null;
  initials: string;
  uploadAction: (state: FormState, formData: FormData) => Promise<FormState>;
  removeAction: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<FormState>(initialFormState);
  const [pending, startTransition] = useTransition();

  const run = (task: () => Promise<FormState>) =>
    startTransition(async () => {
      const result = await task();
      setState(result);
      if (result.status === 'success') router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Avatar url={url} initials={initials} size={72} />
        <div className="flex min-w-0 flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={() => input.current?.click()}>
            {t(locale, 'emp.profile.avatarUpload')}
          </Button>
          {url && (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => run(() => removeAction(initialFormState, new FormData()))}
            >
              {t(locale, 'emp.profile.avatarRemove')}
            </Button>
          )}
        </div>
      </div>

      <input
        ref={input}
        type="file"
        name="avatar"
        accept={allowed.join(',')}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          if (!allowed.includes(file.type) || file.size > maxBytes) {
            setState({ status: 'error', message: t(locale, 'emp.profile.avatarHint') });
            return;
          }
          const data = new FormData();
          data.set('avatar', file);
          run(() => uploadAction(initialFormState, data));
        }}
      />

      <p className="text-xs leading-5 text-muted-foreground">{t(locale, 'emp.profile.avatarHint')}</p>
      <FormMessage status={state.status} message={state.message} />
    </div>
  );
}
