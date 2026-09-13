'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { FormMessage } from '@/components/form-controls';
import { initialFormState } from '@/lib/actions';

type Item = { id: string; position: number; title: string; instruction: string | null; is_required: boolean; completed_at: string | null };
type Action = (state: typeof initialFormState, formData: FormData) => Promise<typeof initialFormState>;

function ChecklistButton({ completed }: { completed: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className={`min-h-12 w-full rounded-md border-2 px-4 text-left text-base font-semibold disabled:opacity-60 ${completed ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 bg-white text-slate-900 hover:border-teal-700'}`}>{pending ? 'Wird gespeichert...' : completed ? 'Erledigt - erneut öffnen' : 'Als erledigt markieren'}</button>;
}

export function JobChecklist({ items, completeItem }: { items: Item[]; completeItem: (itemId: string, completed: boolean, state: typeof initialFormState, formData: FormData) => Promise<typeof initialFormState> }) {
  if (items.length === 0) return null;
  const completedCount = items.filter((item) => item.completed_at).length;
  return <section className="rounded-lg border bg-white p-5"><div className="flex items-baseline justify-between gap-3"><div><h2 className="text-lg font-semibold">Checkliste</h2><p className="mt-1 text-sm text-slate-600">{completedCount} von {items.length} Punkten erledigt</p></div></div><ol className="mt-5 space-y-4">{items.sort((a, b) => a.position - b.position).map((item) => <ChecklistItem key={item.id} item={item} action={completeItem.bind(null, item.id, !item.completed_at)} />)}</ol></section>;
}

function ChecklistItem({ item, action }: { item: Item; action: Action }) {
  const [state, formAction] = useActionState(action, initialFormState);
  return <li className="rounded-md border p-4"><p className="font-medium">{item.title} {!item.is_required && <span className="ml-2 text-xs font-normal text-slate-500">Optional</span>}</p>{item.instruction && <p className="mt-2 text-sm text-slate-600">{item.instruction}</p>}<form action={formAction} className="mt-4"><ChecklistButton completed={Boolean(item.completed_at)} /></form><FormMessage status={state.status} message={state.message} /></li>;
}
