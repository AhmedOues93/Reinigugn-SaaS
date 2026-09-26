/* eslint-disable @next/next/no-img-element */
'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Camera, ChevronDown } from 'lucide-react';
import { Button, Select, Textarea } from '@/components/ui';
import { FormMessage } from '@/components/form-controls';
import { initialFormState } from '@/lib/actions';
import { t, type Locale } from '@/lib/i18n';

type ChecklistItem = { id: string; title: string };
type Action = (state: typeof initialFormState, formData: FormData) => Promise<typeof initialFormState>;

function UploadButton({ locale }: { locale: Locale }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="block" disabled={pending}>
      {pending ? t(locale, 'common.saving') : t(locale, 'emp.photo.upload')}
    </Button>
  );
}

export function JobPhotoUpload({
  action,
  checklistItems,
  locale = 'de',
  category = 'DOCUMENTATION',
  title,
}: {
  action: Action;
  checklistItems: ChecklistItem[];
  locale?: Locale;
  category?: 'BEFORE' | 'AFTER' | 'DOCUMENTATION';
  title?: string;
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
    <form action={formAction} className="space-y-3">
      <FormMessage status={state.status} message={state.message} />
      <input type="hidden" name="category" value={category} />
      {title && <p className="text-sm font-semibold">{title}</p>}
      <label className="group relative flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed border-foreground/15 bg-subtle p-4 text-center transition-colors hover:border-primary/50 focus-within:border-primary">
        {preview ? (
          <img src={preview} alt={t(locale, 'emp.photo.file')} className="absolute inset-0 size-full object-cover" />
        ) : (
          <>
            <span className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <Camera className="size-6" aria-hidden="true" />
            </span>
            <span className="text-base font-semibold text-foreground">{t(locale, 'emp.photo.file')}</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {t(locale, 'emp.photo.hint')}
            </span>
          </>
        )}
        <input
          className="absolute inset-0 cursor-pointer opacity-0"
          type="file"
          name="photo"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          required
          aria-label={t(locale, 'emp.photo.file')}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (preview) URL.revokeObjectURL(preview);
            setPreview(file ? URL.createObjectURL(file) : null);
          }}
        />
      </label>

      <details className="group rounded-xl border border-border/80">
        <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between px-4 text-sm font-medium text-muted-foreground">
          {t(locale, 'common.note')}
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="space-y-4 border-t border-border/80 p-4">
          {checklistItems.length > 0 && (
            <label className="block text-sm font-medium">
              {t(locale, 'emp.photo.linkItem')}
              <Select className="mt-1.5" name="checklist_item_id" defaultValue="">
                <option value="">{t(locale, 'emp.photo.noItem')}</option>
                {checklistItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <label className="block text-sm font-medium">
            {t(locale, 'common.note')}
            <Textarea className="mt-1.5 min-h-20" name="description" maxLength={500} />
          </label>
        </div>
      </details>
      <UploadButton locale={locale} />
    </form>
  );
}
