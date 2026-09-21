'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, Inbox, Plus, UserPlus, Users } from 'lucide-react';

/**
 * The office's most frequent "new" actions in one place, so starting work never
 * means first finding the right list page. Sorted by the order work flows in.
 */
const actions = [
  { href: '/dashboard/vertrieb/anfragen/neu', label: 'Anfrage', hint: 'Interessent oder Bestandskunde', icon: Inbox },
  { href: '/dashboard/kunden/neu', label: 'Kunde', hint: 'Stammdaten direkt anlegen', icon: Users },
  { href: '/dashboard/mitarbeiter/neu', label: 'Mitarbeiter', hint: 'Einladung senden', icon: UserPlus },
];

export function QuickCreateMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Neu anlegen"
        className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary pe-2.5 ps-3 text-sm font-semibold text-primary-foreground shadow-[inset_0_1px_0_0_rgb(255_255_255/0.14),0_1px_2px_0_rgb(11_42_51/0.2)] transition-colors hover:bg-[hsl(189_80%_23%)] max-md:h-touch max-md:w-touch max-md:justify-center max-md:p-0"
      >
        <Plus className="size-4" aria-hidden="true" />
        <span className="max-md:sr-only">Neu</span>
        <ChevronDown className={`size-3.5 opacity-70 transition-transform max-md:hidden ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute end-0 z-50 mt-2 w-[19rem] max-w-[calc(100vw-2rem)] animate-fade-in rounded-xl border border-border bg-card p-1.5 shadow-popover">
          <ul className="grid gap-0.5">
            {actions.map(({ href, label, hint, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setOpen(false)}
                  className="group flex min-h-touch items-center gap-3 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-primary-soft/70"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-card group-hover:text-primary">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{label}</span>
                    <span className="block text-xs text-muted-foreground">{hint}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
