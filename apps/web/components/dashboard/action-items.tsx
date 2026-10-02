import Link from 'next/link';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  MailWarning,
  Receipt,
  UserRoundX,
} from 'lucide-react';
import { cn } from '@reinigung/ui';
import { CardLink, SectionCard } from '@/components/ui';
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

  return (
    <SectionCard
      title="Offene Aufgaben"
      action={<CardLink href="/dashboard/leistungsnachweise">Alle anzeigen</CardLink>}
      flush
    >
      {entries.length === 0 ? (
        <p className="flex items-center gap-2.5 px-5 pb-5 pt-1 text-sm text-success">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          Nichts offen – alles im grünen Bereich.
        </p>
      ) : (
        <ul className="divide-y divide-border/70 border-t border-border/70">
          {entries.map((entry) => (
            <li key={entry.href + entry.label}>
              <Link
                href={entry.href}
                className="group flex min-h-touch items-start gap-3 px-5 py-3 transition-colors hover:bg-subtle md:min-h-0"
              >
                <span
                  className={cn(
                    'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg',
                    entry.tone === 'danger' && 'bg-danger-soft text-danger',
                    entry.tone === 'warning' && 'bg-warning-soft text-warning',
                    entry.tone === 'primary' && 'bg-primary-soft text-primary',
                  )}
                >
                  <entry.icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 text-sm leading-6 group-hover:text-primary">
                  <span className="font-semibold tabular-nums">{entry.count}</span> {entry.label}
                </span>
                {/*
                  Urgency comes from what the item is, not from a field somebody
                  typed: a disputed service blocks an invoice, an expired
                  invitation does not. Shown as a word as well as a colour.
                */}
                <span
                  className={cn(
                    'mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    entry.tone === 'danger' && 'bg-danger-soft text-danger',
                    entry.tone === 'warning' && 'bg-warning-soft text-warning',
                    entry.tone === 'primary' && 'bg-primary-soft text-primary',
                  )}
                >
                  {entry.tone === 'danger' ? 'Hoch' : entry.tone === 'warning' ? 'Mittel' : 'Niedrig'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
