'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { FormMessage } from '@/components/form-controls';
import { initialFormState } from '@/lib/actions';
import { t, type Locale } from '@/lib/i18n';

type Item = { id: string; position: number; title: string; instruction: string | null; is_required: boolean; completed_at: string | null };
type Action = (state: typeof initialFormState, formData: FormData) => Promise<typeof initialFormState>;

function ChecklistButton({ completed, locale }: { completed: boolean; locale: Locale }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`min-h-12 w-full rounded-md border-2 px-4 text-start text-base font-semibold transition-colors disabled:opacity-60 ${
        completed ? 'border-primary bg-primary text-primary-foreground' : 'border-slate-300 bg-white text-slate-900 hover:border-primary'
      }`}
    >
      {pending ? t(locale, 'common.saving') : t(locale, completed ? 'emp.checklist.reopen' : 'emp.checklist.markDone')}
    </button>
  );
}

export function JobChecklist({
  items,
  completeItem,
  locale = 'de',
}: {
  items: Item[];
  completeItem: (itemId: string, completed: boolean, state: typeof initialFormState, formData: FormData) => Promise<typeof initialFormState>;
  locale?: Locale;
}) {
  if (items.length === 0) return null;
  const done = items.filter((item) => item.completed_at).length;
  return (
    <section className="rounded-lg border bg-white p-5">
      <h2 className="text-lg font-semibold">{t(locale, 'emp.job.checklist')}</h2>
      <p className="mt-1 text-sm text-slate-600">{t(locale, 'emp.job.checklistProgress', { done, total: items.length })}</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100" role="presentation">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round((done / items.length) * 100)}%` }} />
      </div>
      <ol className="mt-5 space-y-4">
        {[...items]
          .sort((a, b) => a.position - b.position)
          .map((item) => (
            <ChecklistItem key={item.id} item={item} locale={locale} action={completeItem.bind(null, item.id, !item.completed_at)} />
          ))}
      </ol>
    </section>
  );
}

function ChecklistItem({ item, action, locale }: { item: Item; action: Action; locale: Locale }) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <li className="rounded-md border p-4">
      <p className="font-medium">
        {item.title}
        {!item.is_required && <span className="ms-2 text-xs font-normal text-slate-500">{t(locale, 'common.optional')}</span>}
      </p>
      {item.instruction && <p className="mt-2 text-sm text-slate-600">{item.instruction}</p>}
      <form action={formAction} className="mt-4">
        <ChecklistButton completed={Boolean(item.completed_at)} locale={locale} />
      </form>
      <FormMessage status={state.status} message={state.message} />
    </li>
  );
}
