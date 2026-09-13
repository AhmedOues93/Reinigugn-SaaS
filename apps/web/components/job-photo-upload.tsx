/* eslint-disable @next/next/no-img-element */
'use client';

import { useActionState, useEffect, useState } from 'react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { initialFormState } from '@/lib/actions';

type ChecklistItem = { id: string; title: string };
type Action = (state: typeof initialFormState, formData: FormData) => Promise<typeof initialFormState>;

export function JobPhotoUpload({ action, checklistItems }: { action: Action; checklistItems: ChecklistItem[] }) {
  const [state, formAction] = useActionState(action, initialFormState); const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  return <section className="rounded-lg border bg-white p-5"><h2 className="text-lg font-semibold">Foto dokumentieren</h2><p className="mt-1 text-sm text-slate-600">Nimm ein Bild auf oder wähle eines vom Geraet. Maximal 10 MB.</p><form action={formAction} className="mt-5 space-y-4"><FormMessage status={state.status} message={state.message} /><label className="block text-sm font-medium">Foto<input className="mt-2 block w-full text-sm" type="file" name="photo" accept="image/jpeg,image/png,image/webp" capture="environment" required onChange={(event) => { const file = event.target.files?.[0]; if (preview) URL.revokeObjectURL(preview); setPreview(file ? URL.createObjectURL(file) : null); }} /></label>{preview && <img src={preview} alt="Vorschau des ausgewählten Fotos" className="max-h-72 w-full rounded-md object-cover" />}<label className="block text-sm font-medium">Kategorie<select className="mt-1.5 h-11 w-full rounded-md border bg-white px-3" name="category" defaultValue="DOCUMENTATION"><option value="BEFORE">Vorher</option><option value="AFTER">Nachher</option><option value="DOCUMENTATION">Dokumentation</option></select></label>{checklistItems.length > 0 && <label className="block text-sm font-medium">Checklistenpunkt (optional)<select className="mt-1.5 h-11 w-full rounded-md border bg-white px-3" name="checklist_item_id" defaultValue=""><option value="">Keinem Punkt zuordnen</option>{checklistItems.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}<label className="block text-sm font-medium">Notiz (optional)<textarea className="mt-1.5 min-h-24 w-full rounded-md border p-3 text-sm" name="description" maxLength={500} placeholder="Kurze Information zum Foto" /></label><SubmitButton>Foto hochladen</SubmitButton></form></section>;
}
