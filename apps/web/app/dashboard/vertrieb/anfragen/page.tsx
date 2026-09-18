import Link from 'next/link';
import { Plus, Sparkles } from 'lucide-react';
import { Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui';
import { leadStatusTone, listLeads, type LeadStatus } from '@/lib/data/sales';
import { formatDate } from '@/lib/format';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';

const filters: (LeadStatus | 'all')[] = ['all', 'NEW', 'CONTACTED', 'SURVEY_BOOKED', 'QUOTED', 'WON', 'LOST'];

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const active = (filters as string[]).includes(status ?? '') ? (status as LeadStatus | 'all') : 'all';
  const [locale, leads] = await Promise.all([currentLocale(), listLeads(active)]);

  return (
    <>
      <PageHeader
        title={t(locale, 'sales.leads.title')}
        description={t(locale, 'sales.leads.subtitle')}
        actions={
          <Link href="/dashboard/vertrieb/anfragen/neu">
            <Button>
              <Plus className="size-4" aria-hidden="true" />
              {t(locale, 'sales.leads.new')}
            </Button>
          </Link>
        }
      />

      <nav className="mb-5 flex flex-wrap gap-2" aria-label={t(locale, 'common.status')}>
        {filters.map((filter) => (
          <Link
            key={filter}
            href={filter === 'all' ? '/dashboard/vertrieb/anfragen' : `/dashboard/vertrieb/anfragen?status=${filter}`}
            aria-current={active === filter ? 'page' : undefined}
            className={`inline-flex min-h-touch items-center rounded-md border px-3 text-sm font-medium transition-colors ${
              active === filter ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-card hover:bg-muted'
            }`}
          >
            {filter === 'all' ? t(locale, 'sales.leads.title') : t(locale, `sales.status.${filter}`)}
          </Link>
        ))}
      </nav>

      {leads.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="size-5" />}
          title={t(locale, 'sales.leads.empty')}
          body={t(locale, 'sales.leads.emptyBody')}
        />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {leads.map((lead) => (
              <li key={lead.id}>
                <Link
                  href={`/dashboard/vertrieb/anfragen/${lead.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 p-5 hover:bg-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{lead.organisation}</p>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {[lead.contact_person, lead.city, lead.source].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">{formatDate(locale, lead.created_at)}</span>
                    <Badge tone={leadStatusTone[lead.status as LeadStatus]}>{t(locale, `sales.status.${lead.status}`)}</Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
