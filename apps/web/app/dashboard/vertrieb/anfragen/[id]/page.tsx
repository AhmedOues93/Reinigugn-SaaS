import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import {
  BackLink,
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  DataRow,
  EmptyState,
  PageHeader,
} from '@/components/ui';
import { LeadStatusActions } from '@/components/sales/lead-status-actions';
import { SurveyForm } from '@/components/sales/survey-form';
import {
  getLead,
  leadStatusTone,
  listSurveyorOptions,
  quoteStatusTone,
  type LeadStatus,
  type QuoteStatus,
} from '@/lib/data/sales';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';
import { scheduleSurvey, setLeadStatus } from '../../actions';

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [locale, lead, surveyors] = await Promise.all([
    currentLocale(),
    getLead(id),
    listSurveyorOptions(),
  ]);
  if (!lead) notFound();
  const decided = lead.status === 'WON' || lead.status === 'LOST';

  return (
    <div className="mx-auto max-w-4xl">
      <BackLink href="/dashboard/vertrieb/anfragen">{t(locale, 'sales.leads.title')}</BackLink>

      <PageHeader
        title={lead.organisation}
        actions={
          <Badge tone={leadStatusTone[lead.status as LeadStatus]}>
            {t(locale, `sales.status.${lead.status}`)}
          </Badge>
        }
      />

      {lead.converted_customer_id && (
        <p className="mb-5 rounded-md bg-success-soft p-3 text-sm text-success">
          {t(locale, 'sales.lead.convertedTo')}:{' '}
          <Link
            className="inline-flex min-h-touch items-center font-medium underline"
            href={`/dashboard/kunden/${lead.converted_customer_id}`}
          >
            {lead.organisation}
          </Link>
        </p>
      )}
      {lead.lost_reason && (
        <p className="mb-5 rounded-md bg-danger-soft p-3 text-sm text-danger">
          {t(locale, 'sales.lead.lostReason')}: {lead.lost_reason}
        </p>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <Card className="p-5">
          <h2 className="mb-2 font-semibold">{t(locale, 'sales.lead.contact')}</h2>
          <dl className="divide-y divide-border">
            <DataRow label={t(locale, 'sales.lead.contact')} value={lead.contact_person ?? '—'} />
            <DataRow label={t(locale, 'auth.email')} value={lead.email ?? '—'} />
            <DataRow label={t(locale, 'emp.job.call')} value={lead.phone ?? '—'} />
            <DataRow
              label={t(locale, 'common.address')}
              value={
                [lead.street, [lead.postal_code, lead.city].filter(Boolean).join(' ')]
                  .filter(Boolean)
                  .join(', ') || '—'
              }
            />
            <DataRow label={t(locale, 'sales.lead.source')} value={lead.source ?? '—'} />
            <DataRow label={t(locale, 'common.date')} value={formatDate(locale, lead.created_at)} />
          </dl>
          {lead.notes && (
            <p className="break-anywhere mt-4 whitespace-pre-wrap text-sm text-muted-foreground">
              {lead.notes.replace(/^\[TESTDATEN\]\s*/i, '')}
            </p>
          )}
        </Card>

        {!decided && (
          <Card className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(locale, 'common.status')}</p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <Badge tone={leadStatusTone[lead.status as LeadStatus]}>{t(locale, `sales.status.${lead.status}`)}</Badge>
              <LeadStatusActions action={setLeadStatus.bind(null, lead.id)} locale={locale} />
            </div>
          </Card>
        )}
      </div>

      <Card className="mt-5 overflow-hidden">
        <CardHeader title={t(locale, 'sales.surveys.title')} />
        {lead.surveys.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<ClipboardList className="size-5" />}
              title={t(locale, 'sales.survey.empty')}
            />
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
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDateTime(locale, survey.scheduled_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={survey.status === 'COMPLETED' ? 'success' : 'warning'}>
                      {t(locale, `sales.survey.status.${survey.status}`)}
                    </Badge>
                    <span className="inline-flex min-h-10 items-center rounded-md border border-border bg-card px-3 text-xs font-semibold">Ansehen</span>
                  </div>
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
                    <p className="truncate font-medium">
                      {quote.quote_number ?? t(locale, 'billing.draft')}
                    </p>
                    <p className="mt-1 truncate text-sm text-muted-foreground">{quote.title}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold tabular-nums">{formatMoney(locale, quote.gross_total_cents, quote.currency)}</span>
                    <Badge tone={quoteStatusTone[quote.status as QuoteStatus]}>{t(locale, `sales.quote.status.${quote.status}`)}</Badge>
                    <span className="inline-flex min-h-10 items-center rounded-md border border-border bg-card px-3 text-xs font-semibold">Ansehen</span>
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
          <p className="mb-4 text-sm text-muted-foreground">Termin und Objektangaben in zwei kurzen Schritten erfassen.</p>
          <SurveyForm
            action={scheduleSurvey.bind(null, lead.id)}
            locale={locale}
            surveyors={surveyors}
            defaults={{
              siteName: lead.organisation,
              street: lead.street ?? '',
              postalCode: lead.postal_code ?? '',
              city: lead.city ?? '',
            }}
          />
        </Card>
      )}
    </div>
  );
}
