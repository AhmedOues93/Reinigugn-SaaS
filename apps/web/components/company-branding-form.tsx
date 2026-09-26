/* eslint-disable @next/next/no-img-element -- signed, short-lived storage URL */
'use client';

import { useActionState, useEffect, useState } from 'react';
import { Eye, ImagePlus, Palette, Pencil, Trash2, X } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Button } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';

type PreviewLine = { description: string; quantity: number; unit: string; unit_price_cents: number; gross_amount_cents: number };
type PreviewQuote = {
  quote_number?: string | null;
  title?: string | null;
  currency?: string | null;
  net_total_cents?: number | null;
  vat_total_cents?: number | null;
  gross_total_cents?: number | null;
  valid_until?: string | null;
  recipient_name?: string | null;
  recipient_address?: string | null;
  lines?: PreviewLine[];
} | null;

function money(cents: number | null | undefined, currency = 'EUR') {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(Number(cents ?? 0) / 100);
}

export function CompanyBrandingForm({
  action,
  removeAction,
  logoUrl,
  brandColor,
  companyName = 'Ihr Unternehmen',
  previewQuote,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  removeAction: (state: FormState, formData: FormData) => Promise<FormState>;
  logoUrl: string | null;
  brandColor: string | null;
  companyName?: string;
  previewQuote?: PreviewQuote;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [removeState, removeFormAction] = useActionState(removeAction, initialFormState);
  const [editing, setEditing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [color, setColor] = useState(brandColor ?? '#0f766e');

  useEffect(() => {
    if (state.status === 'success') setEditing(false);
  }, [state.status]);

  const quote = previewQuote ?? {
    quote_number: 'LAYOUT-DEMO',
    title: 'Beispiel-Leistungsverzeichnis',
    currency: 'EUR',
    net_total_cents: 85000,
    vat_total_cents: 16150,
    gross_total_cents: 101150,
    valid_until: '2026-10-15',
    recipient_name: 'TESTDATEN – Beispielkunde',
    recipient_address: 'Beispielstraße 12 · 60311 Frankfurt',
    lines: [
      { description: 'Unterhaltsreinigung Büroflächen', quantity: 20, unit: 'Std.', unit_price_cents: 3500, gross_amount_cents: 83300 },
      { description: 'Materialpauschale', quantity: 1, unit: 'Pauschal', unit_price_cents: 15000, gross_amount_cents: 17850 },
    ],
  };
  const currency = quote.currency ?? 'EUR';

  return (
    <div className="space-y-5">
      <FormMessage status={state.status} message={state.message} />
      <FormMessage status={removeState.status} message={removeState.message} />

      {!editing ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid size-16 place-items-center overflow-hidden rounded-xl border border-border bg-white">
              {logoUrl ? <img src={logoUrl} alt="Firmenlogo" className="max-h-14 max-w-14 object-contain" /> : <span className="px-2 text-center text-xs font-semibold text-muted-foreground">{companyName}</span>}
            </div>
            <div>
              <p className="font-semibold">Markenauftritt</p>
              <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground"><span className="size-4 rounded border" style={{ backgroundColor: color }} />{color.toUpperCase()}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setPreviewOpen(true)}><Eye className="size-4" />Vorschau</Button>
            <Button type="button" variant="outline" onClick={() => setEditing(true)}><Pencil className="size-4" />Bearbeiten</Button>
          </div>
        </div>
      ) : (
        <form action={formAction} className="space-y-5">
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
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton>Änderungen speichern</SubmitButton>
            <Button type="button" variant="outline" onClick={() => setEditing(false)}>Abbrechen</Button>
            <Button type="button" variant="outline" onClick={() => setPreviewOpen(true)}><Eye className="size-4" />Vorschau</Button>
            {logoUrl && <button formAction={removeFormAction} className="inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-danger hover:bg-danger-soft"><Trash2 className="size-4" />Logo entfernen</button>}
          </div>
        </form>
      )}

      {previewOpen && (
        <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/60 p-3 sm:p-8" role="dialog" aria-modal="true" aria-label="Dokumentvorschau">
          <button type="button" className="fixed inset-0 cursor-default" aria-label="Vorschau schließen" onClick={() => setPreviewOpen(false)} />
          <div className="relative mx-auto max-w-4xl">
            <div className="mb-3 flex justify-end">
              <Button type="button" variant="outline" className="bg-card" onClick={() => setPreviewOpen(false)}><X className="size-4" />Schließen</Button>
            </div>
            <div className="min-h-[900px] rounded-xl bg-white p-8 text-slate-900 shadow-2xl sm:p-12">
              <div className="mb-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
                Layoutvorschau – keine echten Kunden- oder Angebotsdaten
              </div>
              <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-7">
                <div>
                  {logoUrl ? <img src={logoUrl} alt="Firmenlogo" className="mb-4 max-h-16 max-w-52 object-contain" /> : <p className="mb-3 text-xl font-bold">{companyName}</p>}
                  <p className="text-sm text-slate-500">{companyName}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold tracking-[0.18em] text-slate-400">ANGEBOT</p>
                  <p className="mt-2 text-lg font-bold">Nr. {quote.quote_number ?? 'Entwurf'}</p>
                </div>
              </header>
              <div className="mt-7 h-1 w-20 rounded-full" style={{ backgroundColor: color }} />
              <div className="mt-8 grid gap-8 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Empfänger</p>
                  <p className="mt-2 font-semibold">{quote.recipient_name ?? 'Kunde'}</p>
                  <p className="mt-1 text-sm text-slate-600">{quote.recipient_address ?? 'Adresse nicht hinterlegt'}</p>
                </div>
                <div className="sm:text-right">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Gültig bis</p>
                  <p className="mt-2 text-sm">{quote.valid_until ? new Intl.DateTimeFormat('de-DE').format(new Date(quote.valid_until)) : '—'}</p>
                </div>
              </div>
              <h1 className="mt-10 text-2xl font-bold">{quote.title ?? 'Angebot'}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Vielen Dank für Ihre Anfrage. Nachfolgend erhalten Sie unser Angebot für die vereinbarten Reinigungsleistungen.</p>
              <div className="mt-8 overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Leistung</th><th className="p-3 text-right">Menge</th><th className="p-3 text-right">Einzelpreis</th><th className="p-3 text-right">Gesamt</th></tr></thead>
                  <tbody>
                    {(quote.lines ?? []).map((line, index) => (
                      <tr key={index} className="border-t border-slate-100">
                        <td className="p-3 font-medium">{line.description}</td>
                        <td className="p-3 text-right">{line.quantity} {line.unit}</td>
                        <td className="p-3 text-right">{money(line.unit_price_cents, currency)}</td>
                        <td className="p-3 text-right font-medium">{money(line.gross_amount_cents, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-7 ml-auto w-full max-w-sm space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Netto</span><span>{money(quote.net_total_cents, currency)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">MwSt.</span><span>{money(quote.vat_total_cents, currency)}</span></div>
                <div className="flex justify-between border-t border-slate-200 pt-3 text-lg font-bold"><span>Gesamt</span><span>{money(quote.gross_total_cents, currency)}</span></div>
              </div>
              <div className="mt-12 grid gap-6 border-t border-slate-200 pt-7 sm:grid-cols-2">
                <div><p className="text-xs font-semibold uppercase text-slate-400">Konditionen</p><p className="mt-2 text-sm leading-6 text-slate-600">Preise gemäß Leistungsverzeichnis. Änderungen und Zusatzleistungen nur nach Abstimmung.</p></div>
                <div><p className="text-xs font-semibold uppercase text-slate-400">Kontakt</p><p className="mt-2 text-sm leading-6 text-slate-600">{companyName}<br />Vielen Dank für Ihr Vertrauen.</p></div>
              </div>
              <footer className="mt-16 border-t border-slate-200 pt-4 text-center text-xs text-slate-400">Seite 1 von 1 · Layoutvorschau · TESTDATEN</footer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
