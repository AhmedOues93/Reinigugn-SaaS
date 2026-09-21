/* eslint-disable @next/next/no-img-element -- signed, short-lived storage URL */
'use client';

import { useActionState, useState } from 'react';
import { Eye, ImagePlus, Palette, Trash2 } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Button } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';

export function CompanyBrandingForm({ action, removeAction, logoUrl, brandColor, companyName = 'Ihr Unternehmen', submitLabel = 'Branding speichern' }: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  removeAction: (state: FormState, formData: FormData) => Promise<FormState>;
  logoUrl: string | null;
  brandColor: string | null;
  companyName?: string;
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [removeState, removeFormAction] = useActionState(removeAction, initialFormState);
  const [preview, setPreview] = useState(true);
  const [color, setColor] = useState(brandColor ?? '#0f766e');

  return (
    <div className="space-y-5">
      <FormMessage status={state.status} message={state.message} />
      <FormMessage status={removeState.status} message={removeState.message} />

      <form action={formAction} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <label className="group flex min-h-28 cursor-pointer items-center gap-4 rounded-xl border border-dashed border-border bg-subtle/40 p-4 transition-colors hover:border-primary/50">
              <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-card shadow-sm"><ImagePlus className="size-5 text-primary" /></span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">Firmenlogo</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">PNG, JPG, WebP oder SVG · max. 2 MB</span>
                <span className="mt-2 block text-xs font-medium text-primary">Datei auswählen</span>
              </span>
              <input className="sr-only" type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" />
            </label>

            <label className="flex min-h-28 cursor-pointer flex-col justify-between rounded-xl border border-border/80 bg-card p-4">
              <span className="flex items-center gap-2 text-sm font-semibold"><Palette className="size-4 text-primary" /> Akzentfarbe</span>
              <span className="flex items-center gap-3">
                <input className="size-10 cursor-pointer rounded-lg border border-input bg-card p-1" type="color" name="brand_color" value={color} onChange={(event) => setColor(event.target.value)} />
                <span className="font-mono text-xs text-muted-foreground">{color.toUpperCase()}</span>
              </span>
            </label>
          </div>

          <p className="text-sm leading-6 text-muted-foreground">Logo und Akzentfarbe werden in Navigation, Kundenportal und Geschäftsdokumenten verwendet. Der Inhalt bleibt schwarz, weiß und grau; die Akzentfarbe markiert nur Marke und wichtige Aktionen.</p>

          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton>{submitLabel}</SubmitButton>
            <Button type="button" variant="outline" onClick={() => setPreview((value) => !value)}><Eye className="size-4" /> {preview ? 'Vorschau ausblenden' : 'Vorschau anzeigen'}</Button>
            {logoUrl && <button formAction={removeFormAction} className="inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><Trash2 className="size-4" /> Logo entfernen</button>}
          </div>
        </div>

        <div className={`${preview ? 'block' : 'hidden lg:block'} rounded-xl border border-border/80 bg-subtle/40 p-3`}>
          <div className="aspect-[210/297] overflow-hidden rounded-lg border bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3 border-b pb-3">
              <div className="grid h-10 w-24 place-items-center">
                {logoUrl ? <img src={logoUrl} alt="Firmenlogo" className="max-h-10 max-w-full object-contain" /> : <span className="max-w-full truncate text-[9px] font-semibold text-gray-500">{companyName}</span>}
              </div>
              <span className="text-[8px] text-gray-400">ANGEBOT</span>
            </div>
            <div className="mt-5 h-1 w-12 rounded-full" style={{ backgroundColor: color }} />
            <p className="mt-3 text-[10px] font-semibold text-gray-800">Angebot Nr. 2026-0042</p>
            <p className="mt-1 text-[8px] leading-4 text-gray-400">Musterkunde GmbH<br />Musterstrasse 12 · 20095 Hamburg</p>
            <div className="mt-5 space-y-2">{[92, 78, 86, 64].map((width) => <div key={width} className="h-1.5 rounded bg-gray-100" style={{ width: `${width}%` }} />)}</div>
            <div className="mt-6 rounded border border-gray-100 p-2"><div className="h-1.5 w-20 rounded bg-gray-200" /><div className="mt-2 h-1.5 w-full rounded bg-gray-100" /><div className="mt-1.5 h-1.5 w-4/5 rounded bg-gray-100" /></div>
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">Layoutvorschau · echte Angebots- und Rechnungsdaten erscheinen erst im jeweiligen Dokument</p>
        </div>
      </form>
    </div>
  );
}
