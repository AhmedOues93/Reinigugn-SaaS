import Link from 'next/link';
import {
  AlertTriangle,
  CalendarClock,
  ChevronRight,
  ClipboardCheck,
  MailWarning,
  Receipt,
  UserRoundX,
} from 'lucide-react';
import { cn } from '@reinigung/ui';
import type { OfficeActionItems } from '@/lib/data/billing';

/**
 * What needs a decision today.
 *
 * Only items that already have a place to be resolved, each linking straight
 * to it. Anything at zero disappears — a list of noughts trains people to stop
 * reading the panel, and then the one that matters goes unnoticed too.
 */
export function OfficeActionPanel({ items }: { items: OfficeActionItems }) {
  const entries = [
    {
      count: items.disputedServices,
      label: 'gemeldete Probleme an Leistungen',
      href: '/dashboard/leistungsnachweise?filter=PROBLEM_GEMELDET',
      icon: AlertTriangle,
      tone: 'danger' as const,
    },
    {
      count: items.unassignedSoon,
      label: 'Einsätze in den nächsten 7 Tagen ohne Zuweisung',
      href: '/dashboard/planung',
      icon: UserRoundX,
      tone: 'danger' as const,
    },
    {
      count: items.readyToBill,
      label: 'Leistungen bereit zur Abrechnung',
      href: '/dashboard/leistungsnachweise?filter=BEREIT',
      icon: Receipt,
      tone: 'primary' as const,
    },
    {
      count: items.awaitingAcceptance,
      label: 'Leistungen warten auf Kundenabnahme',
      href: '/dashboard/leistungsnachweise?filter=ABNAHME_AUSSTEHEND',
      icon: ClipboardCheck,
      tone: 'warning' as const,
    },
    {
      count: items.acceptanceConfigWarnings,
      label: 'Verträge mit Portal-Abnahme ohne Ansprechpartner',
      href: '/dashboard/leistungsnachweise',
      icon: AlertTriangle,
      tone: 'warning' as const,
    },
    {
      count: items.planHorizonWarnings,
      label: 'Reinigungspläne, deren Einsätze bald auslaufen',
      href: '/dashboard/planung',
      icon: CalendarClock,
      tone: 'warning' as const,
    },
    {
      count: items.expiredInvitations,
      label: 'abgelaufene Einladungen',
      href: '/dashboard/mitarbeiter?status=INVITED',
      icon: MailWarning,
      tone: 'warning' as const,
    },
  ].filter((entry) => entry.count > 0);

  if (entries.length === 0) return null;

  return (
    <section aria-labelledby="actions-title" className="mb-6">
      <h2 id="actions-title" className="mb-2.5 text-[15px] font-semibold">
        Zu erledigen
      </h2>
      <ul className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-card">
        {entries.map((entry) => (
          <li key={entry.href + entry.label} className="border-b border-border/70 last:border-0">
            <Link
              href={entry.href}
              className="flex min-h-touch items-center gap-3 px-4 py-3 transition-colors hover:bg-subtle sm:px-5 md:min-h-0"
            >
              <span
                className={cn(
                  'grid size-8 shrink-0 place-items-center rounded-lg',
                  entry.tone === 'danger' && 'bg-danger-soft text-danger',
                  entry.tone === 'warning' && 'bg-warning-soft text-warning',
                  entry.tone === 'primary' && 'bg-primary-soft text-primary',
                )}
              >
                <entry.icon className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 text-[15px] leading-6">
                <span className="font-semibold tabular-nums">{entry.count}</span> {entry.label}
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
