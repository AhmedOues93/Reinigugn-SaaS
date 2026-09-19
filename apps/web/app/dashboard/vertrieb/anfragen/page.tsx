import { Inbox, Plus } from 'lucide-react';
import { Badge, ButtonLink, EmptyState, FilterTabs, PageHeader } from '@/components/ui';
import { DataTable } from '@/components/data-table';
import { leadStatusTone, listLeads, type LeadStatus } from '@/lib/data/sales';
import { formatDate } from '@/lib/format';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';

const filters: (LeadStatus | 'all')[] = ['all', 'NEW', 'CONTACTED', 'SURVEY_BOOKED', 'QUOTED', 'WON', 'LOST'];

type Lead = Awaited<ReturnType<typeof listLeads>>[number];

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const active = (filters as string[]).includes(status ?? '') ? (status as LeadStatus | 'all') : 'all';
  const [locale, all] = await Promise.all([currentLocale(), listLeads('all')]);
  const leads = active === 'all' ? all : all.filter((lead) => lead.status === active);

  return (
    <>
      <PageHeader
        title={t(locale, 'sales.leads.title')}
        description={t(locale, 'sales.leads.subtitle')}
        actions={
          <ButtonLink href="/dashboard/vertrieb/anfragen/neu">
            <Plus className="size-4" aria-hidden="true" />
            {t(locale, 'sales.leads.new')}
          </ButtonLink>
        }
      />
      <FilterTabs
        className="mb-4"
        label={t(locale, 'common.status')}
        items={filters.map((filter) => ({
          href: filter === 'all' ? '/dashboard/vertrieb/anfragen' : `/dashboard/vertrieb/anfragen?status=${filter}`,
          label: filter === 'all' ? 'Alle' : t(locale, `sales.status.${filter}`),
          active: active === filter,
          count: filter === 'all' ? all.length : all.filter((lead) => lead.status === filter).length,
        }))}
      />
      <DataTable<Lead>
        caption={t(locale, 'sales.leads.title')}
        rows={leads}
        rowKey={(lead) => lead.id}
        rowHref={(lead) => `/dashboard/vertrieb/anfragen/${lead.id}`}
        columns={[
          { key: 'org', header: 'Organisation', mobile: 'title', cell: (lead) => lead.organisation },
          { key: 'contact', header: 'Ansprechperson', mobile: 'subtitle', cell: (lead) => lead.contact_person || '—' },
          { key: 'city', header: 'Ort', cell: (lead) => lead.city || '—' },
          { key: 'source', header: 'Quelle', hideBelow: 'lg', cell: (lead) => lead.source || '—' },
          { key: 'created', header: 'Eingang', cell: (lead) => <span className="tabular-nums">{formatDate(locale, lead.created_at)}</span> },
          {
            key: 'status',
            header: 'Status',
            mobile: 'status',
            cell: (lead) => <Badge tone={leadStatusTone[lead.status as LeadStatus]}>{t(locale, `sales.status.${lead.status}`)}</Badge>,
          },
        ]}
        empty={<EmptyState icon={<Inbox />} title={t(locale, 'sales.leads.empty')} body={t(locale, 'sales.leads.emptyBody')} />}
      />
    </>
  );
}
