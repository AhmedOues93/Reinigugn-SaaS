import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { listSurveys } from '@/lib/data/sales';
import { formatDateTime } from '@/lib/format';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';

function first<T>(value: T | T[] | null) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function SurveysPage() {
  const [locale, surveys] = await Promise.all([currentLocale(), listSurveys()]);

  return (
    <>
      <PageHeader title={t(locale, 'sales.surveys.title')} />
      {surveys.length === 0 ? (
        <EmptyState icon={<ClipboardList className="size-5" />} title={t(locale, 'sales.survey.empty')} />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {surveys.map((survey) => {
              const owner = first(survey.leads)?.organisation ?? first(survey.customers)?.name ?? '—';
              return (
                <li key={survey.id}>
                  <Link
                    href={`/dashboard/vertrieb/besichtigungen/${survey.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 p-5 hover:bg-muted"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{survey.site_name}</p>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {owner} · {formatDateTime(locale, survey.scheduled_at)}
                      </p>
                    </div>
                    <Badge tone={survey.status === 'COMPLETED' ? 'success' : survey.status === 'CANCELLED' ? 'danger' : 'warning'}>
                      {t(locale, `sales.survey.status.${survey.status}`)}
                    </Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
