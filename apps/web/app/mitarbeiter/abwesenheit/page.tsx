import { Plane } from 'lucide-react';
import { AbsenceForm } from '@/components/absence-form';
import { AuUploadForm } from '@/components/au-upload-form';
import { Badge, Card } from '@/components/ui';
import { EmployeePageHeader, EmptyState } from '@/components/employee/employee-shell';
import { employeeLocale, listMyAbsences } from '@/lib/data/employee';
import { formatDate } from '@/lib/format';
import { t } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { submitMyAbsence, uploadMyAuDocument } from '../actions';

/*
 * What the office did, not the raw status. A reported sickness is APPROVED in
 * the database so planning treats the day as unavailable, but telling the
 * employee their illness was "genehmigt" is both odd and, when they have also
 * submitted a holiday, actively misleading.
 */
const decisionTone: Record<string, 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'> = {
  REPORTED: 'info',
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};

export default async function EmployeeAbsencePage() {
  const [locale, absences] = await Promise.all([employeeLocale(), listMyAbsences()]);

  // Sickness certificates live in a private bucket; the server mints a short
  // signed URL per row so the path never reaches the browser.
  const supabase = await createClient();
  const documentUrls = new Map<string, string>();
  for (const absence of absences) {
    if (!absence.au_storage_path) continue;
    const { data } = await supabase.storage.from('absence-documents').createSignedUrl(absence.au_storage_path, 300);
    if (data?.signedUrl) documentUrls.set(absence.id, data.signedUrl);
  }

  return (
    <>
      <EmployeePageHeader title={t(locale, 'emp.leave.title')} />

      <Card className="p-5">
        <h2 className="mb-4 font-semibold">{t(locale, 'emp.leave.request')}</h2>
        <AbsenceForm action={submitMyAbsence} locale={locale} />
      </Card>

      <section className="mt-6">
        {absences.length === 0 ? (
          <EmptyState icon={<Plane className="size-5" />} title={t(locale, 'emp.leave.empty')} />
        ) : (
          <ul className="space-y-3">
            {absences.map((absence) => (
              <li key={absence.id} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium">
                    {t(locale, absence.absence_type === 'VACATION' ? 'emp.absence.vacation' : 'emp.absence.sickness')}
                  </p>
                  <Badge tone={decisionTone[absence.decision]}>{t(locale, `emp.absence.decision.${absence.decision}`)}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatDate(locale, absence.start_date)} – {formatDate(locale, absence.end_date)}
                </p>
                {absence.note && <p className="mt-2 text-sm text-muted-foreground">{absence.note}</p>}
                {documentUrls.has(absence.id) && (
                  <a
                    className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary underline"
                    href={documentUrls.get(absence.id)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t(locale, 'emp.absence.auView')}
                  </a>
                )}
                {absence.absence_type === 'SICKNESS' && !absence.au_storage_path && (
                  <AuUploadForm action={uploadMyAuDocument.bind(null, absence.id)} locale={locale} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
