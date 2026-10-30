'use client';

import { useActionState, useCallback, useEffect, useRef, useState } from 'react';
import { PenLine, RotateCcw, ShieldCheck } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Field, Input } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';
import { t, type Locale } from '@/lib/i18n';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

/**
 * The Kundenabnahme, taken on the employee's phone after the work is finished.
 *
 * Shown only when the contract asks for a signature. The employee never chooses
 * the method — by the time this panel appears the decision was made on the
 * Leistungsplan, and all that is left is to hand the phone over.
 *
 * Drawing uses pointer events, which cover finger, stylus and mouse with one
 * code path, and `touch-action: none` so the page does not scroll out from
 * under someone signing.
 */
export function ServiceAcceptancePanel({
  action,
  locale,
}: {
  action: Action;
  locale: Locale;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const signatureRef = useRef<HTMLInputElement | null>(null);
  const drawing = useRef(false);
  const inkRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  // The canvas is sized to its own box in device pixels, so a signature does
  // not come out blurred or squashed on a phone.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const { width, height } = canvas.getBoundingClientRect();
      if (!width || !height) return;
      // Writing to canvas.width wipes the bitmap. Turning the phone while
      // signing therefore used to blank the pad on screen while the hidden
      // field still held the pre-rotation image: the customer saw an empty box
      // and the employee submitted a signature nobody could check. Carry the
      // existing ink across the resize instead.
      const previous = inkRef.current ? canvas.toDataURL('image/png') : null;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const context = canvas.getContext('2d');
      if (!context) return;
      context.scale(ratio, ratio);
      context.lineWidth = 2.2;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.strokeStyle = '#1f2937';
      if (previous) {
        const image = new window.Image();
        image.onload = () => {
          context.drawImage(image, 0, 0, width, height);
          if (signatureRef.current) signatureRef.current.value = canvas.toDataURL('image/png');
        };
        image.src = previous;
      }
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const positionOf = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const begin = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const { x, y } = positionOf(event);
    context.beginPath();
    context.moveTo(x, y);
  };

  const extend = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;
    const { x, y } = positionOf(event);
    context.lineTo(x, y);
    context.stroke();
    if (!inkRef.current) {
      inkRef.current = true;
      setHasInk(true);
    }
  };

  const end = () => {
    drawing.current = false;
    const canvas = canvasRef.current;
    if (canvas && signatureRef.current && inkRef.current) {
      signatureRef.current.value = canvas.toDataURL('image/png');
    }
  };

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (signatureRef.current) signatureRef.current.value = '';
    inkRef.current = false;
    setHasInk(false);
  }, []);

  return (
    <section
      aria-labelledby="acceptance-title"
      className="overflow-hidden rounded-3xl border border-primary/25 bg-primary-soft/40 shadow-card"
    >
      <div className="flex items-start gap-3 px-5 pt-5">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <h2 id="acceptance-title" className="text-lg font-semibold">
            {t(locale, 'emp.acceptance.title')}
          </h2>
          <p className="mt-0.5 text-[15px] leading-6 text-muted-foreground">
            {t(locale, 'emp.acceptance.intro')}
          </p>
        </div>
      </div>

      <form action={formAction} className="space-y-4 p-5">
        <input ref={signatureRef} type="hidden" name="signature" />
        <FormMessage status={state.status} message={state.message} />

        <Field label={t(locale, 'emp.acceptance.signerName')} htmlFor="signer-name">
          <Input id="signer-name" name="signer_name" required minLength={2} maxLength={160} autoComplete="off" />
        </Field>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-sm font-medium">{t(locale, 'emp.acceptance.signature')}</span>
            <button
              type="button"
              onClick={clear}
              className="inline-flex min-h-touch items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted-foreground hover:text-foreground md:min-h-9"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              {t(locale, 'emp.acceptance.clear')}
            </button>
          </div>
          <canvas
            ref={canvasRef}
            onPointerDown={begin}
            onPointerMove={extend}
            onPointerUp={end}
            onPointerLeave={end}
            onPointerCancel={end}
            aria-label={t(locale, 'emp.acceptance.signature')}
            className="h-40 w-full touch-none rounded-2xl border-2 border-dashed border-border bg-card"
          />
          {!hasInk && (
            <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
              <PenLine className="size-4" aria-hidden="true" />
              {t(locale, 'emp.acceptance.signatureHint')}
            </p>
          )}
        </div>

        <SubmitButton size="block">{t(locale, 'emp.acceptance.confirm')}</SubmitButton>
      </form>
    </section>
  );
}

/** What the employee sees once somebody has accepted, on the same screen. */
export function ServiceAcceptedNotice({
  locale,
  name,
  at,
}: {
  locale: Locale;
  name: string | null;
  at: string | null;
}) {
  return (
    <section className="flex items-start gap-3 rounded-2xl border border-success/25 bg-success-soft p-4">
      <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-success">{t(locale, 'emp.acceptance.done')}</p>
        <p className="break-anywhere mt-0.5 text-[15px] leading-6 text-foreground">
          {[name, at ? new Date(at).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
    </section>
  );
}

/** Waiting on the customer's own confirmation in the portal. */
export function ServiceAwaitingPortalNotice({ locale }: { locale: Locale }) {
  return (
    <section className="flex items-start gap-3 rounded-2xl border border-info/25 bg-info-soft p-4">
      <ShieldCheck className="mt-0.5 size-5 shrink-0 text-info" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-info">{t(locale, 'emp.acceptance.portalPending')}</p>
        <p className="mt-0.5 text-[15px] leading-6 text-foreground">
          {t(locale, 'emp.acceptance.portalPendingBody')}
        </p>
      </div>
    </section>
  );
}
