/* eslint-disable @next/next/no-img-element */
'use client';

import { useActionState, useEffect, useState } from 'react';
import { FormMessage } from '@/components/form-controls';
import { initialFormState } from '@/lib/actions';
import { t, type Locale } from '@/lib/i18n';

type ChecklistItem = { id: string; title: string };
type Action = (state: typeof initialFormState, formData: FormData) => Promise<typeof initialFormState>;

function UploadButton({ locale }: { locale: Locale }) {
  return (
    <button
      type="submit"
      className="min-h-12 w-full rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
    >
      {t(locale, 'emp.photo.upload')}
    </button>
  );
}

export function JobPhotoUpload({
  action,
  checklistItems,
  locale = 'de',
}: {
  action: Action;
  checklistItems: ChecklistItem[];
  locale?: Locale;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  return (
    <section className="rounded-lg border bg-white p-5">
      <h2 className="text-lg font-semibold">{t(locale, 'emp.photo.title')}</h2>
      <p className="mt-1 text-sm text-slate-600">{t(locale, 'emp.photo.hint')}</p>
      <form action={formAction} className="mt-5 space-y-4">
        <FormMessage status={state.status} message={state.message} />
        <label className="block text-sm font-medium">
          {t(locale, 'emp.photo.file')}
          <input
            className="mt-2 block w-full text-sm file:min-h-11 file:rounded-md file:border-0 file:bg-slate-100 file:px-4 file:text-sm file:font-medium"
            type="file"
            name="photo"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            required
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (preview) URL.revokeObjectURL(preview);
              setPreview(file ? URL.createObjectURL(file) : null);
            }}
          />
        </label>
        {preview && <img src={preview} alt={t(locale, 'emp.photo.file')} className="max-h-72 w-full rounded-md object-cover" />}
        <label className="block text-sm font-medium">
          {t(locale, 'emp.photo.category')}
          <select className="mt-1.5 min-h-11 w-full rounded-md border bg-white px-3" name="category" defaultValue="DOCUMENTATION">
            <option value="BEFORE">{t(locale, 'emp.photo.before')}</option>
            <option value="AFTER">{t(locale, 'emp.photo.after')}</option>
            <option value="DOCUMENTATION">{t(locale, 'emp.photo.documentation')}</option>
          </select>
        </label>
        {checklistItems.length > 0 && (
          <label className="block text-sm font-medium">
            {t(locale, 'emp.photo.linkItem')}
            <select className="mt-1.5 min-h-11 w-full rounded-md border bg-white px-3" name="checklist_item_id" defaultValue="">
              <option value="">{t(locale, 'emp.photo.noItem')}</option>
              {checklistItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block text-sm font-medium">
          {t(locale, 'common.note')}
          <textarea className="mt-1.5 min-h-24 w-full rounded-md border p-3 text-sm" name="description" maxLength={500} />
        </label>
        <UploadButton locale={locale} />
      </form>
    </section>
  );
}
