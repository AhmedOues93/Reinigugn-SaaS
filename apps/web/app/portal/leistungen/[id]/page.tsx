/* eslint-disable @next/next/no-img-element -- signed, short-lived storage URLs */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Check, ChevronLeft, Minus } from 'lucide-react';
import { Card } from '@/components/ui';
import { getPortalServiceRecord, portalLocale } from '@/lib/data/portal';
import { formatDate } from '@/lib/format';
import { t } from '@/lib/i18n';

export default async function PortalServiceRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [locale, record] = await Promise.all([portalLocale(), getPortalServiceRecord(id)]);
  if (!record) notFound();

  const hours = Math.floor(record.durationMinutes / 60);
  const minutes = record.durationMinutes % 60;

  return (
    <>
      <Link href="/portal/leistungen" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted-foreground">
        <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
        {t(locale, 'common.back')}
      </Link>

      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{record.objectName}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{formatDate(locale, record.scheduledDate, 'long')}</p>

      <Card className="mt-5 p-5">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">{t(locale, 'common.status')}</dt>
            <dd className="mt-1 font-medium">{t(locale, `status.${record.status}`)}</dd>
          </div>
          {record.durationMinutes > 0 && (
            <div>
              <dt className="text-muted-foreground">{t(locale, 'emp.job.plannedTime')}</dt>
              <dd className="mt-1 font-medium tabular-nums">
                {hours} h {minutes} min
              </dd>
            </div>
          )}
        </dl>
      </Card>

      {record.items.length > 0 && (
        <Card className="mt-4 p-5">
          <h2 className="font-semibold">{t(locale, 'emp.job.checklist')}</h2>
          <ul className="mt-4 space-y-2.5">
            {record.items.map((item, index) => (
              <li key={`${item.title}-${index}`} className="flex items-start gap-2.5 text-sm">
                <span
                  className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${
                    item.completed ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {item.completed ? <Check className="size-3.5" aria-hidden="true" /> : <Minus className="size-3.5" aria-hidden="true" />}
                </span>
                <span className={item.completed ? 'text-foreground' : 'text-muted-foreground'}>{item.title}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {record.photos.length > 0 && (
        <Card className="mt-4 p-5">
          <h2 className="font-semibold">{t(locale, 'emp.job.photos')}</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {record.photos.map((photo) => (
              <li key={photo.id}>
                <img
                  src={photo.url!}
                  alt={photo.description ?? t(locale, 'emp.job.photos')}
                  className="aspect-video w-full rounded-md object-cover"
                  loading="lazy"
                />
                {photo.description && <p className="mt-1.5 text-sm text-muted-foreground">{photo.description}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
