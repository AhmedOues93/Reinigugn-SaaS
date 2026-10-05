'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
      theme: string;
      size: string;
    },
  ) => string;
  remove: (id: string) => void;
  reset: (id: string) => void;
};

function api(): TurnstileApi | undefined {
  return (window as Window & { turnstile?: TurnstileApi }).turnstile;
}

/** Optional until the site key and Supabase's CAPTCHA setting are configured. */
export function AuthCaptcha() {
  const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [token, setToken] = useState('');
  const [failed, setFailed] = useState(false);
  const { pending } = useFormStatus();
  const wasPending = useRef(false);

  const render = useCallback(() => {
    const turnstile = api();
    if (!sitekey || !container.current || !turnstile || widget.current !== null) return;
    widget.current = turnstile.render(container.current, {
      sitekey,
      callback: (value) => {
        setToken(value);
        setFailed(false);
      },
      'expired-callback': () => setToken(''),
      'error-callback': () => {
        setToken('');
        setFailed(true);
      },
      theme: 'auto',
      size: 'flexible',
    });
  }, [sitekey]);

  useEffect(() => {
    render();
    return () => {
      if (widget.current !== null) api()?.remove(widget.current);
      widget.current = null;
    };
  }, [render]);

  useEffect(() => {
    // A token is single-use; forms using useActionState stay mounted on errors.
    if (wasPending.current && !pending && widget.current !== null) {
      setToken('');
      api()?.reset(widget.current);
    }
    wasPending.current = pending;
  }, [pending]);

  if (!sitekey) return null;
  return (
    <div className="space-y-2">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={render}
        onError={() => setFailed(true)}
      />
      <div ref={container} />
      <input type="hidden" name="captcha_token" value={token} />
      {failed && (
        <p role="alert" className="text-sm text-danger">
          Die Sicherheitsprüfung konnte nicht geladen werden. Bitte lade die Seite erneut.
        </p>
      )}
    </div>
  );
}
