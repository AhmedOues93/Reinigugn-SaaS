'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { cn } from '@reinigung/ui';
import { Button, Input } from '@/components/ui';
import { t, type Locale } from '@/lib/i18n';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Rule = 'email' | 'password' | 'newPassword' | 'required';

function validate(rule: Rule, value: string, locale: Locale): string | null {
  if (!value.trim()) return t(locale, 'auth.required');
  if (rule === 'email' && !emailPattern.test(value.trim())) return t(locale, 'auth.invalidEmail');
  if (rule === 'newPassword' && value.length < 12) return t(locale, 'auth.passwordTooShort');
  return null;
}

/**
 * Auth form with inline validation. Errors appear after a field is left or on
 * submit — never while someone is still typing — and the first invalid field
 * receives focus. The server action still validates everything again.
 */
export function AuthForm({
  action,
  children,
  locale,
}: {
  action: (formData: FormData) => void | Promise<void>;
  children: React.ReactNode;
  locale: Locale;
}) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      action={action}
      noValidate
      className="space-y-5"
      onSubmit={(event) => {
        const fields = Array.from(event.currentTarget.querySelectorAll<HTMLInputElement>('input[data-rule]'));
        let firstInvalid: HTMLInputElement | null = null;
        for (const field of fields) {
          const message = validate(field.dataset.rule as Rule, field.value, locale);
          field.dispatchEvent(new CustomEvent('auth-validate', { detail: message }));
          if (message && !firstInvalid) firstInvalid = field;
        }
        if (firstInvalid) {
          event.preventDefault();
          firstInvalid.focus();
        }
      }}
    >
      {children}
    </form>
  );
}

export function AuthField({
  name,
  label,
  type = 'text',
  rule,
  autoComplete,
  locale,
  labelAction,
  defaultValue,
}: {
  name: string;
  label: string;
  type?: 'email' | 'password' | 'text';
  rule: Rule;
  autoComplete?: string;
  locale: Locale;
  labelAction?: React.ReactNode;
  defaultValue?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const isPassword = type === 'password';
  const inputRef = useRef<HTMLInputElement>(null);

  // The form announces submit-time validation per field through this event.
  useEffect(() => {
    const node = inputRef.current;
    if (!node) return;
    const listener = (event: Event) => {
      setTouched(true);
      setError((event as CustomEvent<string | null>).detail);
    };
    node.addEventListener('auth-validate', listener);
    return () => node.removeEventListener('auth-validate', listener);
  }, []);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        {labelAction}
      </div>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={isPassword && !visible ? 'password' : isPassword ? 'text' : type}
          autoComplete={autoComplete}
          defaultValue={defaultValue}
          required
          data-rule={rule}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn('min-h-12 text-[15px]', isPassword && 'pe-12')}
          ref={inputRef}
          onBlur={(event) => {
            if (event.currentTarget.value) {
              setTouched(true);
              setError(validate(rule, event.currentTarget.value, locale));
            }
          }}
          onChange={(event) => {
            if (touched && error) setError(validate(rule, event.currentTarget.value, locale));
          }}
          onKeyUp={(event) => isPassword && setCapsLock(event.getModifierState?.('CapsLock') ?? false)}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible((value) => !value)}
            aria-label={t(locale, visible ? 'auth.hidePassword' : 'auth.showPassword')}
            aria-pressed={visible}
            aria-controls={id}
            className="absolute inset-y-0 end-0 grid w-12 place-items-center rounded-e-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-offset-0"
          >
            {visible ? <EyeOff className="size-[18px]" aria-hidden="true" /> : <Eye className="size-[18px]" aria-hidden="true" />}
          </button>
        )}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-[13px] font-medium text-danger">
          {error}
        </p>
      ) : (
        isPassword &&
        capsLock && (
          <p className="text-[13px] font-medium text-warning" role="status">
            {t(locale, 'auth.capsLock')}
          </p>
        )
      )}
    </div>
  );
}

/** Submit with a spinner and a verb, disabled while the action runs. */
export function AuthSubmit({ children, pendingLabel }: { children: React.ReactNode; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="block" disabled={pending} aria-busy={pending} className="mt-2 min-h-12 text-[15px] disabled:opacity-80">
      {pending ? (
        <>
          <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
