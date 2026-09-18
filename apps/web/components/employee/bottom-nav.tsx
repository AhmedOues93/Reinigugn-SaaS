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

/**
 * Primary wayfinding. Each tab is a full-height 60px target with the label always
 * visible — cleaners use this with gloves on and in a hurry, so nothing here is
 * icon-only or hidden behind a menu.
 */
export function EmployeeBottomNav({ locale, unread }: { locale: Locale; unread: number }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={t(locale, 'common.menu')}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-lg">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = href === '/mitarbeiter' ? pathname === href : pathname.startsWith(href);
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
