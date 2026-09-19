import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, ClipboardList, FileText } from 'lucide-react';
import { Badge, Card, CardHeader, DataRow, EmptyState, PageHeader } from '@/components/ui';
import { LeadStatusActions } from '@/components/sales/lead-status-actions';
import { SurveyForm } from '@/components/sales/survey-form';
import { getLead, leadStatusTone, listSurveyorOptions, quoteStatusTone, type LeadStatus, type QuoteStatus } from '@/lib/data/sales';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';
import { scheduleSurvey, setLeadStatus } from '../../actions';

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [locale, lead, surveyors] = await Promise.all([currentLocale(), getLead(id), listSurveyorOptions()]);
  if (!lead) notFound();
  const decided = lead.status === 'WON' || lead.status === 'LOST';

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/dashboard/vertrieb/anfragen"
        className="mb-5 inline-flex min-h-touch items-center gap-2 text-sm font-medium text-muted-foreground"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
        {t(locale, 'sales.leads.title')}
      </Link>

      <PageHeader
        title={lead.organisation}
        actions={<Badge tone={leadStatusTone[lead.status as LeadStatus]}>{t(locale, `sales.status.${lead.status}`)}</Badge>}
      />

      {lead.converted_customer_id && (
        <p className="mb-5 rounded-md bg-success-soft p-3 text-sm text-success">
          {t(locale, 'sales.lead.convertedTo')}:{' '}
          <Link className="inline-flex min-h-touch items-center font-medium underline" href={`/dashboard/kunden/${lead.converted_customer_id}`}>
            {lead.organisation}
          </Link>
        </p>
      )}
      {lead.lost_reason && (
        <p className="mb-5 rounded-md bg-danger-soft p-3 text-sm text-danger">
          {t(locale, 'sales.lead.lostReason')}: {lead.lost_reason}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-2 font-semibold">{t(locale, 'sales.lead.contact')}</h2>
          <dl className="divide-y divide-border">
            <DataRow label={t(locale, 'sales.lead.contact')} value={lead.contact_person ?? '—'} />
            <DataRow label={t(locale, 'auth.email')} value={lead.email ?? '—'} />
            <DataRow label={t(locale, 'emp.job.call')} value={lead.phone ?? '—'} />
            <DataRow
              label={t(locale, 'common.address')}
              value={[lead.street, [lead.postal_code, lead.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—'}
            />
            <DataRow label={t(locale, 'sales.lead.source')} value={lead.source ?? '—'} />
            <DataRow label={t(locale, 'common.date')} value={formatDate(locale, lead.created_at)} />
          </dl>
          {lead.notes && <p className="break-anywhere mt-4 whitespace-pre-wrap text-sm text-muted-foreground">{lead.notes}</p>}
        </Card>

        {!decided && (
          <Card className="p-5">
            <h2 className="mb-4 font-semibold">{t(locale, 'common.status')}</h2>
            <LeadStatusActions action={setLeadStatus.bind(null, lead.id)} locale={locale} />
          </Card>
        )}
      </div>

      <Card className="mt-5 overflow-hidden">
        <CardHeader title={t(locale, 'sales.surveys.title')} />
        {lead.surveys.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={<ClipboardList className="size-5" />} title={t(locale, 'sales.survey.empty')} />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {lead.surveys.map((survey) => (
              <li key={survey.id}>
                <Link
                  href={`/dashboard/vertrieb/besichtigungen/${survey.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 p-5 hover:bg-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{survey.site_name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{formatDateTime(locale, survey.scheduled_at)}</p>
                  </div>
                  <Badge tone={survey.status === 'COMPLETED' ? 'success' : 'warning'}>
                    {t(locale, `sales.survey.status.${survey.status}`)}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {lead.quotes.length > 0 && (
        <Card className="mt-5 overflow-hidden">
          <CardHeader title={t(locale, 'sales.quotes.title')} />
          <ul className="divide-y divide-border">
            {lead.quotes.map((quote) => (
              <li key={quote.id}>
                <Link
                  href={`/dashboard/vertrieb/angebote/${quote.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 p-5 hover:bg-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{quote.quote_number ?? t(locale, 'billing.draft')}</p>
                    <p className="mt-1 truncate text-sm text-muted-foreground">{quote.title}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold tabular-nums">
                      {formatMoney(locale, quote.gross_total_cents, quote.currency)}
                    </span>
                    <Badge tone={quoteStatusTone[quote.status as QuoteStatus]}>
                      {t(locale, `sales.quote.status.${quote.status}`)}
                    </Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!decided && (
        <Card className="mt-5 p-5">
          <h2 className="mb-1 font-semibold">{t(locale, 'sales.survey.new')}</h2>
          <p className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground">
            <FileText className="size-4" aria-hidden="true" />
            {t(locale, 'sales.leads.subtitle')}
            <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
          </p>
          <SurveyForm action={scheduleSurvey.bind(null, lead.id)} locale={locale} surveyors={surveyors} />
        </Card>
      )}
    </div>
  );
}
