'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { logout } from '@/app/(auth)/actions';
import { LanguageSelector } from '@/components/language-selector';
import { t, type Locale } from '@/lib/i18n';

/**
 * Account menu. Anchored to the trailing edge and width-capped so it stays on
 * screen in both directions, and closes on outside click and on Escape — which
 * a `<details>` popover does not do.
 */
export function DashboardUserMenu({ locale, email }: { locale: Locale; email: string }) {
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
        aria-label={email}
        className="flex min-h-touch items-center gap-2 rounded-lg ps-1 pe-1.5 text-sm transition-colors hover:bg-foreground/[0.05] md:min-h-10"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-[13px] font-semibold text-highlight">
          {email.slice(0, 1).toUpperCase()}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground max-sm:hidden" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute end-0 z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] animate-fade-in rounded-xl border border-border bg-card p-1.5 shadow-popover">
          <p className="break-anywhere border-b border-border px-2.5 pb-2.5 pt-1.5 text-sm font-medium text-foreground">{email}</p>
          <div className="pt-1.5" />
          <LanguageSelector locale={locale} className="block px-1 pb-1" />
          <Link
            href="/dashboard/settings"
            onClick={() => setOpen(false)}
            className="flex min-h-touch items-center rounded-lg px-2.5 text-sm transition-colors hover:bg-muted md:min-h-10"
          >
            {t(locale, 'common.settings')}
          </Link>
          <form action={logout}>
            <button type="submit" className="flex min-h-touch w-full items-center rounded-lg px-2.5 text-start text-sm text-danger transition-colors hover:bg-danger-soft md:min-h-10">
              {t(locale, 'common.logout')}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
