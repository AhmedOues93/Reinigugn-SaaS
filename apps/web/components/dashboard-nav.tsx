'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Settings, X } from 'lucide-react';
import { cn } from '@reinigung/ui';
import { navGroups, navIcons } from '@/components/dashboard-shell';
import { t, type Locale } from '@/lib/i18n';

/**
 * One nav definition rendered two ways: a grouped rail on desktop and a real
 * dialog-style drawer on mobile. The drawer is React state rather than
 * `<details>` so it closes on navigation and on Escape, and it traps the page
 * behind a scrim instead of letting the header clip it.
 */
export function DashboardNav({ locale, mobile = false }: { locale: Locale; mobile?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => (href === '/dashboard' ? pathname === href : pathname.startsWith(href));

  const list = (
    <div className="space-y-5">
      {navGroups.map((group) => (
        <div key={group.label}>
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t(locale, group.label)}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = navIcons[item.icon as keyof typeof navIcons];
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-touch items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
                      active ? 'bg-primary-soft text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{t(locale, item.label)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <div className="border-t border-border pt-4">
        <Link
          href="/dashboard/settings"
          onClick={() => setOpen(false)}
          aria-current={isActive('/dashboard/settings') ? 'page' : undefined}
          className={cn(
            'flex min-h-touch items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
            isActive('/dashboard/settings')
              ? 'bg-primary-soft text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <Settings className="size-4 shrink-0" aria-hidden="true" />
          {t(locale, 'nav.settings')}
        </Link>
      </div>
    </div>
  );

  if (!mobile) return <nav aria-label={t(locale, 'common.menu')}>{list}</nav>;

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t(locale, 'common.menu')}
        aria-expanded={open}
        className="grid min-h-touch min-w-touch place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t(locale, 'common.menu')}>
          <button
            type="button"
            aria-label={t(locale, 'common.cancel')}
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          />
          <nav
            className="absolute inset-y-0 start-0 flex w-[17rem] max-w-[85vw] animate-fade-in flex-col border-e border-border bg-card"
            onKeyDown={(event) => event.key === 'Escape' && setOpen(false)}
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4">
              <span className="text-sm font-semibold">{t(locale, 'common.menu')}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t(locale, 'common.cancel')}
                className="grid min-h-touch min-w-touch place-items-center rounded-md text-muted-foreground hover:bg-muted"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-4">{list}</div>
          </nav>
        </div>
      )}
    </div>
  );
}
