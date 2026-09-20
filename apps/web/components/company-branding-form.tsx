/* eslint-disable @next/next/no-img-element -- signed, short-lived storage URL */
'use client';

import { useActionState } from 'react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { initialFormState, type FormState } from '@/lib/actions';

/**
 * Logo and accent colour for the tenant. The upload goes to a private bucket and
 * the stored path is written by a security-definer function that derives the
 * company from the caller's own membership.
 */
export function CompanyBrandingForm({
  action,
  removeAction,
  logoUrl,
  brandColor,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  removeAction: (state: FormState, formData: FormData) => Promise<FormState>;
  logoUrl: string | null;
  brandColor: string | null;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [removeState, removeFormAction] = useActionState(removeAction, initialFormState);

  return (
    <div className="space-y-5">
      <FormMessage status={state.status} message={state.message} />
      <FormMessage status={removeState.status} message={removeState.message} />

      <div className="flex flex-wrap items-center gap-4">
        <div className="grid h-20 w-40 place-items-center rounded-xl border border-border/80 bg-subtle p-2">
          {logoUrl ? (
            <img src={logoUrl} alt="Firmenlogo" className="max-h-16 max-w-full object-contain" />
          ) : (
            <span className="text-xs text-muted-foreground">Kein Logo</span>
          )}
        </div>
        {logoUrl && (
          <form action={removeFormAction}>
            <SubmitButton variant="outline">Logo entfernen</SubmitButton>
          </form>
        )}
      </div>

      <form action={formAction} className="space-y-4">
        <label className="block text-sm font-medium">
          Logo (PNG, JPG, WebP oder SVG, max. 2 MB)
          <input
            className="mt-1.5 block w-full rounded-lg border border-input bg-card px-3 py-2 text-sm file:me-3 file:min-h-9 file:rounded-md file:border-0 file:bg-muted file:px-3 file:text-sm file:font-medium hover:border-foreground/30"
            type="file"
            name="logo"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
          />
        </label>
        <label className="block text-sm font-medium">
          Akzentfarbe
          <input
            className="mt-1.5 h-11 w-24 cursor-pointer rounded-lg border border-input bg-card p-1.5"
            type="color"
            name="brand_color"
            defaultValue={brandColor ?? '#0f766e'}
          />
        </label>
        <SubmitButton>Branding speichern</SubmitButton>
      </form>
    </div>
  );
}
