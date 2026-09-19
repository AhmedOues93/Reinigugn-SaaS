import { FormPage } from '@/components/ui';
import { NewCalculationForm } from '@/components/kalkulation/new-calculation-form';
import { listCustomerOptions } from '@/lib/data/customers';
import { listCatalogItems } from '@/lib/data/kalkulation';
import { listSurveys } from '@/lib/data/sales';
import { createCalculation } from '../actions';

/**
 * A calculation starts either from a Besichtigung — in which case the measured
 * areas become positions and the m² finally drive the time instead of being
 * recorded and ignored — or from a blank sheet for an existing customer.
 */
export default async function NewCalculationPage() {
  const [customers, catalog, surveys] = await Promise.all([
    listCustomerOptions(),
    listCatalogItems(),
    listSurveys('COMPLETED').catch(() => []),
  ]);

  return (
    <FormPage
      back={{ href: '/dashboard/kalkulation', label: 'Kalkulation' }}
      title="Neue Kalkulation"
      width="narrow"
    >
      <NewCalculationForm
        action={createCalculation}
        customers={customers}
        catalog={catalog}
        surveys={surveys.map((survey) => ({
          id: survey.id,
          label: [survey.site_name, survey.city].filter(Boolean).join(' · ') || 'Besichtigung',
        }))}
      />
    </FormPage>
  );
}
