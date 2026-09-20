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
export function DashboardUserMenu({
  locale,
  email,
  displayName,
  companyName,
}: {
  locale: Locale;
  email: string;
  displayName?: string;
  companyName?: string;
}) {
  // Initials from the name when there is one, otherwise the address. Two
  // letters, because one is ambiguous the moment a company has two Sabines.
  const source = displayName?.trim() || email;
  const initials = source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
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
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-[12px] font-semibold text-highlight">
          {initials || '?'}
        </span>
        {/* Who you are and which company you are in, because an office
            colleague can belong to more than one and acting in the wrong one
            is an expensive mistake to notice late. */}
        <span className="hidden min-w-0 text-start leading-tight lg:block">
          <span className="block max-w-[11rem] truncate text-[13px] font-semibold">
            {displayName?.trim() || email}
          </span>
          {companyName && (
            <span className="block max-w-[11rem] truncate text-[11.5px] text-muted-foreground">{companyName}</span>
          )}
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
