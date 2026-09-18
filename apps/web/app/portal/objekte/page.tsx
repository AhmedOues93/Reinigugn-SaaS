import { Building2 } from 'lucide-react';
import { PortalEmptyState, PortalPageHeader } from '@/components/portal/portal-shell';
import { listPortalObjects, portalLocale } from '@/lib/data/portal';
import { t } from '@/lib/i18n';

export default async function PortalObjectsPage() {
  const [locale, objects] = await Promise.all([portalLocale(), listPortalObjects()]);

  return (
    <>
      <PortalPageHeader title={t(locale, 'portal.objects.title')} />
      {objects.length === 0 ? (
        <PortalEmptyState icon={<Building2 className="size-5" />} title={t(locale, 'portal.objects.empty')} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {objects.map((object) => (
            <li key={object.id} className="rounded-lg border bg-white p-4">
              <p className="font-medium text-slate-900">{object.name}</p>
              <p className="mt-1 text-sm text-slate-600">
                {object.street}
                {object.street && <br />}
                {object.postal_code} {object.city}
              </p>
              {object.contact_person && <p className="mt-2 text-sm text-slate-500">{object.contact_person}</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
