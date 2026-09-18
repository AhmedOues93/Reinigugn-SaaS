'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, FileText, LayoutDashboard, MessageSquareWarning, Receipt } from 'lucide-react';
import { cn } from '@reinigung/ui';
import { t, type Locale, type TranslationKey } from '@/lib/i18n';

const tabs: { href: string; label: TranslationKey; icon: typeof LayoutDashboard }[] = [
  { href: '/portal', label: 'portal.tab.overview', icon: LayoutDashboard },
  { href: '/portal/objekte', label: 'portal.tab.objects', icon: Building2 },
  { href: '/portal/leistungen', label: 'portal.tab.services', icon: FileText },
  { href: '/portal/rechnungen', label: 'portal.tab.invoices', icon: Receipt },
  { href: '/portal/reklamationen', label: 'portal.tab.complaints', icon: MessageSquareWarning },
];

export function PortalNav({ locale, variant }: { locale: Locale; variant: 'top' | 'bottom' }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/portal' ? pathname === href : pathname.startsWith(href));

  if (variant === 'bottom') {
    return (
      <nav
        aria-label={t(locale, 'common.menu')}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto flex max-w-lg">
          {tabs.map(({ href, label, icon: Icon }) => (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={isActive(href) ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium',
                  isActive(href) ? 'text-primary' : 'text-slate-500',
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                <span className="max-w-full truncate">{t(locale, label)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    );
  }

  return (
    <nav aria-label={t(locale, 'common.menu')} className="flex gap-1 overflow-x-auto">
      {tabs.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? 'page' : undefined}
          className={cn(
            'flex min-h-11 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors',
            isActive(href) ? 'border-primary text-primary' : 'border-transparent text-slate-600 hover:text-slate-900',
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
          {t(locale, label)}
        </Link>
      ))}
    </nav>
  );
}
