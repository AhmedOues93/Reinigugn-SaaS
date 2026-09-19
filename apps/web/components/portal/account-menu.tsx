'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { logout } from '@/app/(auth)/actions';
import { LanguageSelector } from '@/components/language-selector';
import { t, type Locale } from '@/lib/i18n';

export function PortalAccountMenu({ locale, email, customerName }: { locale: Locale; email: string; customerName: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t(locale, 'portal.profile.title')}
        className="grid min-h-touch min-w-touch place-items-center rounded-md hover:bg-muted"
      >
        <span className="grid size-9 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
          {(customerName || email).slice(0, 1).toUpperCase()}
        </span>
      </button>

      {open && (
        <div className="absolute end-0 z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] animate-fade-in rounded-lg border border-border bg-card p-1.5 shadow-popover">
          <p className="break-anywhere px-2.5 pb-2 pt-1 text-xs text-muted-foreground">{email}</p>
          <LanguageSelector locale={locale} className="block px-1 pb-1" />
          <Link
            href="/portal/profil"
            onClick={() => setOpen(false)}
            className="flex min-h-touch items-center rounded-md px-2.5 text-sm hover:bg-muted"
          >
            {t(locale, 'portal.profile.title')}
          </Link>
          <form action={logout}>
            <button type="submit" className="flex min-h-touch w-full items-center rounded-md px-2.5 text-start text-sm hover:bg-muted">
              {t(locale, 'common.logout')}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
