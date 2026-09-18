'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, CircleUserRound, Home, MessageSquare, Plane } from 'lucide-react';
import { cn } from '@reinigung/ui';
import { t, type Locale, type TranslationKey } from '@/lib/i18n';

const tabs: { href: string; label: TranslationKey; icon: typeof Home }[] = [
  { href: '/mitarbeiter', label: 'emp.tab.today', icon: Home },
  { href: '/mitarbeiter/einsaetze', label: 'emp.tab.schedule', icon: CalendarDays },
  { href: '/mitarbeiter/nachrichten', label: 'emp.tab.messages', icon: MessageSquare },
  { href: '/mitarbeiter/abwesenheit', label: 'emp.tab.leave', icon: Plane },
  { href: '/mitarbeiter/profil', label: 'emp.tab.profile', icon: CircleUserRound },
];

function useActive() {
  const pathname = usePathname();
  return (href: string) => (href === '/mitarbeiter' ? pathname === href : pathname.startsWith(href));
}

/**
 * Bottom tab bar — the phone pattern only. Hidden from `md` upwards, where
 * `EmployeeTopNav` takes over, so a desktop is never given a stretched phone UI.
 * Each tab is a 60px target with an always-visible label: cleaners use this in a
 * hurry, sometimes with gloves on.
 */
export function EmployeeBottomNav({ locale, unread }: { locale: Locale; unread: number }) {
  const isActive = useActive();
  return (
    <nav
      aria-label={t(locale, 'common.menu')}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-lg">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          const showBadge = href === '/mitarbeiter/nachrichten' && unread > 0;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-[3.75rem] flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <span className="relative">
                  <Icon className={cn('size-6', active && 'stroke-[2.25]')} aria-hidden="true" />
                  {showBadge && (
                    <span className="absolute -end-2 -top-1 grid min-w-[1.1rem] place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate">{t(locale, label)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The same destinations as a horizontal bar, from `md` upwards. Same routes,
 * same badge, same functionality — only the shape changes with the viewport.
 */
export function EmployeeTopNav({ locale, unread }: { locale: Locale; unread: number }) {
  const isActive = useActive();
  return (
    <nav aria-label={t(locale, 'common.menu')} className="hidden flex-1 md:block">
      <ul className="flex gap-1">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          const showBadge = href === '/mitarbeiter/nachrichten' && unread > 0;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-touch items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors',
                  active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="relative">
                  <Icon className="size-4" aria-hidden="true" />
                  {showBadge && (
                    <span className="absolute -end-2 -top-1.5 grid min-w-[1rem] place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </span>
                {t(locale, label)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
