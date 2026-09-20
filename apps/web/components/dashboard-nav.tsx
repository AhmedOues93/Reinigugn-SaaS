'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Settings, X } from 'lucide-react';
import { cn } from '@reinigung/ui';
import { CompanyBrand } from '@/components/company-brand';
import { navGroups, navIcons } from '@/components/dashboard-shell';
import type { CompanyBranding } from '@/lib/data/branding';
import { t, type Locale } from '@/lib/i18n';

/**
 * One nav definition rendered two ways: the Tiefsee rail on desktop and a
 * drawer of the same rail on smaller screens. Active state is carried by three
 * cues at once — a lit bar at the start edge, a lighter surface and full-white
 * text — so it never depends on colour alone.
 */
export function DashboardNav({
  locale,
  unread = 0,
  mobile = false,
  branding,
  companyName,
}: {
  locale: Locale;
  unread?: number;
  mobile?: boolean;
  branding?: Pick<CompanyBranding, 'name' | 'logoUrl'> | null;
  companyName?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  // Close on route change; lock page scroll and move focus while the drawer is open.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    const triggerNode = trigger.current;
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
      triggerNode?.focus();
    };
  }, [open]);

  const item = (href: string, label: string, Icon: (typeof navIcons)[keyof typeof navIcons], badge?: number) => {
    const active = isActive(href);
    return (
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13.5px] font-medium transition-colors max-lg:min-h-touch',
          active
            ? 'bg-white/[0.09] text-white'
            : 'text-ink-muted hover:bg-white/[0.05] hover:text-white',
          'focus-visible:ring-highlight focus-visible:ring-offset-ink',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-y-2 start-0 w-[3px] rounded-full bg-highlight transition-opacity',
            active ? 'opacity-100' : 'opacity-0',
          )}
        />
        <Icon
          className={cn('size-[17px] shrink-0 transition-colors', active ? 'text-highlight' : 'text-ink-muted group-hover:text-white')}
          aria-hidden="true"
        />
        <span className="truncate">{label}</span>
        {badge ? (
          <span className="ms-auto rounded-full bg-highlight/15 px-1.5 text-[11px] font-semibold tabular-nums text-highlight">
            {badge > 9 ? '9+' : badge}
          </span>
        ) : null}
      </Link>
    );
  };

  const list = (
    <div className="space-y-5">
      {navGroups.map((group) => (
        <div key={group.label}>
          <p className="px-3 pb-1.5 text-[11.5px] font-medium text-ink-muted/70">{t(locale, group.label)}</p>
          <ul className="space-y-0.5">
            {group.items.map((entry) => (
              <li key={entry.href}>
                {item(
                  entry.href,
                  t(locale, entry.label),
                  navIcons[entry.icon as keyof typeof navIcons],
                  entry.icon === 'messages' ? unread : undefined,
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="border-t border-ink-line pt-4">{item('/dashboard/settings', t(locale, 'nav.settings'), Settings)}</div>
    </div>
  );

  if (!mobile) return <nav aria-label={t(locale, 'common.mainNav')}>{list}</nav>;

  return (
    <div className="lg:hidden">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t(locale, 'common.menu')}
        aria-expanded={open}
        className="-ms-2 grid size-touch place-items-center rounded-lg text-foreground transition-colors hover:bg-foreground/[0.05]"
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t(locale, 'common.menu')}>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className="absolute inset-0 animate-fade-in bg-ink/50 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          />
          <nav
            aria-label={t(locale, 'common.mainNav')}
            className="surface-ink absolute inset-y-0 start-0 flex w-[288px] max-w-[86vw] animate-slide-in flex-col shadow-popover rtl:[animation-name:none]"
          >
            <div className="flex h-16 shrink-0 items-center justify-between gap-2 ps-5 pe-2 [&_img]:brightness-0 [&_img]:invert">
              <CompanyBrand branding={branding ?? null} className="text-white [&_span_span]:text-highlight" />
              <button
                ref={closeButton}
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t(locale, 'common.close')}
                className="grid size-touch place-items-center rounded-lg text-ink-muted transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-4 pt-2">{list}</div>
            {companyName && (
              <div className="shrink-0 border-t border-ink-line px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <p className="truncate text-sm font-medium text-white" title={companyName}>{companyName}</p>
              </div>
            )}
          </nav>
        </div>
      )}
    </div>
  );
}
