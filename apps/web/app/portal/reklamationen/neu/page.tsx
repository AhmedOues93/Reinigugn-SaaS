import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { Card } from '@/components/ui';
import { PortalComplaintForm } from '@/components/portal/complaint-form';
import { listPortalObjects, portalLocale } from '@/lib/data/portal';
import { t } from '@/lib/i18n';
import { createPortalComplaint } from '../../actions';

export default async function NewPortalComplaintPage() {
  const [locale, objects] = await Promise.all([portalLocale(), listPortalObjects()]);

  return (
    <>
      <Link href="/portal/reklamationen" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted-foreground">
        <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
        {t(locale, 'common.back')}
      </Link>
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t(locale, 'portal.complaints.new')}</h1>
      <Card className="mt-5 p-5">
        <PortalComplaintForm
          action={createPortalComplaint}
          locale={locale}
          objects={objects.map((object) => ({ id: object.id, name: object.name }))}
        />
      </Card>
    </>
  );
}
