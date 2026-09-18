'use client';

import { useState } from 'react';
import { ChevronDown, KeyRound, Phone, Sparkles, User } from 'lucide-react';
import { Card } from '@/components/ui';
import { t, type Locale } from '@/lib/i18n';

type Site = {
  contact_person: string | null;
  contact_phone: string | null;
  access_instructions: string | null;
  cleaning_instructions: string | null;
};

/**
 * Site information a cleaner needs on location — access, contact, cleaning
 * notes — kept collapsed by default so the daily flow stays uncluttered and
 * opened with one tap when they actually need it.
 */
export function SiteDetails({ site, locale }: { site: Site; locale: Locale }) {
  const [open, setOpen] = useState(false);
  const rows = [
    { icon: User, label: t(locale, 'emp.job.contact'), value: site.contact_person },
    { icon: KeyRound, label: t(locale, 'emp.job.access'), value: site.access_instructions },
    { icon: Sparkles, label: t(locale, 'emp.job.details'), value: site.cleaning_instructions },
  ].filter((row) => row.value);

  if (rows.length === 0 && !site.contact_phone) return null;

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-h-touch w-full items-center justify-between gap-3 px-5 py-4 text-start text-sm font-semibold hover:bg-muted"
      >
        {t(locale, open ? 'emp.job.hideDetails' : 'emp.job.showDetails')}
        <ChevronDown className={`size-5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="animate-fade-in space-y-4 border-t border-border px-5 py-4">
          {site.contact_phone && (
            <a
              href={`tel:${site.contact_phone.replace(/\s/g, '')}`}
              className="flex min-h-touch items-center gap-2.5 rounded-md bg-primary-soft px-3 text-sm font-semibold text-primary"
            >
              <Phone className="size-4 shrink-0" aria-hidden="true" />
              {site.contact_phone}
            </a>
          )}
          {rows.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex gap-2.5">
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="break-anywhere mt-0.5 whitespace-pre-wrap text-sm">{value}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
