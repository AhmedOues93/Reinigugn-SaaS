'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { BrandMark } from '@/components/brand-mark';
import { ProductBrand } from '@/components/company-brand';
import { nav } from '@/lib/marketing-content';

/**
 * The marketing header.
 *
 * It sits on Tiefsee for the whole page rather than turning transparent over
 * the hero and solid further down: a bar that changes colour while you scroll
 * is a small delight and a reliable source of contrast bugs, and this bar
 * carries the only way into the app.
 *
 * On a phone the section links collapse behind a menu button, but "Anmelden"
 * never does — someone arriving to sign in should not have to open a menu.
 */
export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-ink-line bg-ink pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-16 w-full max-w-[1180px] items-center gap-4 px-5 sm:px-6 lg:px-8">
        <Link href="/" className="inline-flex min-w-0 items-center gap-2.5" aria-label="ReinPlan – Startseite">
          <BrandMark className="size-8 shrink-0 text-highlight" />
          <ProductBrand className="truncate text-[1.15rem] text-white [&_span]:text-highlight" />
        </Link>

        <nav aria-label="Seitenbereiche" className="ms-auto hidden items-center gap-1 md:flex">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-medium text-white/70 transition-colors hover:bg-white/[0.07] hover:text-white"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-2 md:ms-3">
          <Link
            href="/admin/login"
            className="inline-flex min-h-touch items-center rounded-lg px-3 text-sm font-semibold text-white/85 transition-colors hover:bg-white/[0.07] hover:text-white md:min-h-9"
          >
            Anmelden
          </Link>
          <Link
            href="/signup"
            className="hidden min-h-9 items-center rounded-lg bg-highlight px-4 text-sm font-semibold text-ink transition-colors hover:bg-[hsl(158_64%_58%)] sm:inline-flex"
          >
            Kostenlos testen
          </Link>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="marketing-menu"
            aria-label={open ? 'Menü schließen' : 'Menü öffnen'}
            className="grid size-touch place-items-center rounded-lg text-white/80 transition-colors hover:bg-white/[0.07] hover:text-white md:hidden"
          >
            {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {open && (
        <nav id="marketing-menu" aria-label="Seitenbereiche" className="border-t border-ink-line px-5 pb-4 pt-2 sm:px-6 md:hidden">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="flex min-h-touch items-center rounded-lg px-3 text-[15px] font-medium text-white/80 transition-colors hover:bg-white/[0.07] hover:text-white"
            >
              {item.label}
            </a>
          ))}
          <Link
            href="/signup"
            onClick={() => setOpen(false)}
            className="mt-2 flex min-h-touch items-center justify-center rounded-lg bg-highlight px-4 text-sm font-semibold text-ink sm:hidden"
          >
            Kostenlos testen
          </Link>
        </nav>
      )}
    </header>
  );
}
