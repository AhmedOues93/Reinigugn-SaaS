import { FormPage } from '@/components/ui';
import { redirect } from 'next/navigation';
import { getCalculationDefaults } from '@/lib/data/kalkulation';
import { NewCalculationForm } from '@/components/kalkulation/new-calculation-form';
import { listCustomerOptions } from '@/lib/data/customers';
import { listCleaningObjects } from '@/lib/data/cleaning-objects';
import { listCatalogItems } from '@/lib/data/kalkulation';
import { listSurveys } from '@/lib/data/sales';
import { createCalculation } from '../actions';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';

/**
 * A calculation starts either from a Besichtigung — in which case the measured
 * areas become positions and the m² finally drive the time instead of being
 * recorded and ignored — or from a blank sheet for an existing customer.
 */
export default async function NewCalculationPage({
  searchParams,
}: {
  searchParams: Promise<{ survey?: string; kunde?: string; objekt?: string }>;
}) {
  const { survey: preferredSurveyId, kunde: preferredCustomerId, objekt: preferredObjectId } = await searchParams;
  const locale = await currentLocale();
  const defaults = await getCalculationDefaults();
  if (defaults.wage_cents_per_hour === 0) {
    redirect(`/dashboard/kalkulation/grundlagen?next=${encodeURIComponent(preferredSurveyId ? `/dashboard/kalkulation/neu?survey=${preferredSurveyId}` : '/dashboard/kalkulation/neu')}`);
  }
  const [customers, objects, catalog, surveys] = await Promise.all([
    listCustomerOptions(),
    listCleaningObjects({}),
    listCatalogItems(),
    listSurveys('COMPLETED').catch(() => []),
  ]);

  return (
    <FormPage
      back={{ href: '/dashboard/vertrieb/angebote', label: t(locale, 'sales.quotes.title') }}
      title={t(locale, 'sales.quote.newTitle')}
      description={t(locale, 'sales.quote.newSubtitle')}
      width="narrow"
    >
      <NewCalculationForm
        action={createCalculation}
        locale={locale}
        customers={customers}
        objects={objects.map((object) => ({ id: object.id, customerId: object.customer_id, name: object.name }))}
        catalog={catalog}
        preferredSurveyId={preferredSurveyId}
        preferredCustomerId={preferredCustomerId}
        preferredObjectId={preferredObjectId}
        surveys={surveys.map((survey) => ({
          id: survey.id,
          label: [survey.site_name, survey.city].filter(Boolean).join(' · ') || 'Besichtigung',
        }))}
      />
    </FormPage>
  );
}
