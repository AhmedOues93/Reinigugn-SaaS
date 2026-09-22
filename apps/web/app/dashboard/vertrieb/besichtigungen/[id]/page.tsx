import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Ruler } from 'lucide-react';
import {
  BackLink,
  Badge,
  Card,
  CardHeader,
  DataRow,
  EmptyState,
  PageHeader,
} from '@/components/ui';
import { SurveyAreaEditor } from '@/components/sales/survey-area-editor';
import { CompleteSurveyForm } from '@/components/sales/survey-actions';
import {
  getCompanyHourlyRate,
  getSurvey,
  quoteStatusTone,
  type QuoteStatus,
} from '@/lib/data/sales';
import { formatDateTime, formatMoney } from '@/lib/format';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';
import {
  addSurveyArea,
  completeSurvey,
  removeSurveyArea,
} from '../../actions';

function first<T>(value: T | T[] | null) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function SurveyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [locale, survey, hourlyRate] = await Promise.all([
    currentLocale(),
    getSurvey(id),
    getCompanyHourlyRate(),
  ]);
  if (!survey) notFound();

  const lead = first(survey.leads);
  const customer = first(survey.customers);
  const owner = lead?.organisation ?? customer?.name ?? '';
  const planned = survey.status === 'PLANNED';

  return (
    <div className="mx-auto max-w-3xl">
      <BackLink
        href={
          survey.lead_id
            ? `/dashboard/vertrieb/anfragen/${survey.lead_id}`
            : '/dashboard/vertrieb/besichtigungen'
        }
      >
        {survey.lead_id ? t(locale, 'sales.leads.title') : t(locale, 'sales.surveys.title')}
      </BackLink>

      <PageHeader
        title={survey.site_name}
        description={owner}
        actions={
          <Badge
            tone={
              survey.status === 'COMPLETED'
                ? 'success'
                : survey.status === 'CANCELLED'
                  ? 'danger'
                  : 'warning'
            }
          >
            {t(locale, `sales.survey.status.${survey.status}`)}
          </Badge>
        }
      />

      <Card className="p-4 sm:p-5">
        <dl className="divide-y divide-border">
          <DataRow
            label={t(locale, 'sales.survey.scheduledAt')}
            value={formatDateTime(locale, survey.scheduled_at)}
          />
          <DataRow
            label={t(locale, 'common.address')}
            value={
              [survey.street, [survey.postal_code, survey.city].filter(Boolean).join(' ')]
                .filter(Boolean)
                .join(', ') || '—'
            }
          />
          {survey.access_notes && (
            <DataRow label={t(locale, 'sales.survey.accessNotes')} value={survey.access_notes} />
          )}
          {survey.findings && (
            <DataRow label={t(locale, 'sales.survey.findings')} value={survey.findings} />
          )}
        </dl>
      </Card>

      <Card className="mt-4 overflow-hidden">
        <CardHeader
          title={t(locale, 'sales.area.title')}
          description={t(locale, 'sales.area.emptyBody')}
        />
        <div className="p-4 sm:p-5">
          {survey.areas.length === 0 && !planned ? (
            <EmptyState icon={<Ruler className="size-5" />} title={t(locale, 'sales.area.empty')} />
          ) : (
            <SurveyAreaEditor
              locale={locale}
              areas={survey.areas}
              fallbackRateCents={hourlyRate}
              editable={planned}
              addAction={addSurveyArea.bind(null, survey.id)}
              removeAction={removeSurveyArea.bind(null, survey.id)}
            />
          )}
        </div>
      </Card>

      {planned && (
        <Card className="mt-4 p-4 sm:p-5">
          <h2 className="mb-4 font-semibold">{t(locale, 'sales.survey.complete')}</h2>
          <CompleteSurveyForm action={completeSurvey.bind(null, survey.id)} locale={locale} />
        </Card>
      )}

      {survey.status === 'COMPLETED' && (
        <Card className="mt-5 p-5">
          <h2 className="font-semibold">Nächster Schritt: Kalkulation</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Besichtigungsdaten übernehmen, Kosten und Verkaufspreis prüfen und danach das Angebot erstellen.</p>
          <Link
            href={`/dashboard/kalkulation/neu?survey=${survey.id}`}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground sm:w-auto"
          >
            Zur Kalkulation
          </Link>
        </Card>
      )}

      {survey.quotes.length > 0 && (
        <Card className="mt-5 overflow-hidden">
          <CardHeader title={t(locale, 'sales.quotes.title')} />
          <ul className="divide-y divide-border">
            {survey.quotes.map((quote) => (
              <li key={quote.id}>
                <Link
                  href={`/dashboard/vertrieb/angebote/${quote.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 p-5 hover:bg-muted"
                >
                  <p className="min-w-0 truncate font-medium">
                    {quote.quote_number ?? quote.title}
                  </p>
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
    </div>
  );
}
