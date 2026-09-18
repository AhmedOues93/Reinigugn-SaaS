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
 * Persistent bottom navigation, the primary wayfinding of the employee app.
 * Every target is a full-width touch target of at least 56px and stays clear of
 * the home indicator through the safe-area inset.
 */
export function EmployeeBottomNav({ locale, unread }: { locale: Locale; unread: number }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={t(locale, 'common.menu')}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
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
                  'flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-slate-500 hover:text-slate-800',
                )}
              >
                <span className="relative">
                  <Icon className="size-5" aria-hidden="true" />
                  {showBadge && (
                    <span className="absolute -end-2 -top-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-4 text-white">
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
