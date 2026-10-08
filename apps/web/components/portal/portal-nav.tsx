'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, FileSignature, FileText, LayoutDashboard, MessageSquareWarning, Receipt } from 'lucide-react';
import { cn } from '@reinigung/ui';
import { t, type Locale, type TranslationKey } from '@/lib/i18n';

const tabs: { href: string; label: TranslationKey; icon: typeof LayoutDashboard }[] = [
  { href: '/portal', label: 'portal.tab.overview', icon: LayoutDashboard },
  { href: '/portal/objekte', label: 'portal.tab.objects', icon: Building2 },
  { href: '/portal/leistungen', label: 'portal.tab.services', icon: FileText },
  { href: '/portal/angebote', label: 'portal.tab.quotes', icon: FileSignature },
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
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border/80 bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-16px_rgb(11_42_51/0.25)] backdrop-blur-md"
      >
        <ul className="mx-auto flex max-w-lg px-1">
          {tabs.map(({ href, label, icon: Icon }) => (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={isActive(href) ? 'page' : undefined}
                className={cn(
                  'flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium',
                  isActive(href) ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )}
              >
                <span className={cn('grid h-8 w-12 place-items-center rounded-full', isActive(href) && 'bg-primary-soft text-primary')}>
                  <Icon className="size-5" aria-hidden="true" />
                </span>
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
            isActive(href) ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
          )}
        >
          <Icon className={cn('size-4', isActive(href) && 'text-primary')} aria-hidden="true" />
          {t(locale, label)}
        </Link>
      ))}
    </nav>
  );
}
