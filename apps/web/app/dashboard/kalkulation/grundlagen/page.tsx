import { FormPage } from '@/components/ui';
import { CalculationDefaultsForm } from '@/components/kalkulation/defaults-form';
import { getCalculationDefaults } from '@/lib/data/kalkulation';
import { saveCalculationDefaults } from '../actions';

/**
 * The four numbers every calculation starts from.
 *
 * Deliberately not pre-filled with plausible-looking German rates. An invented
 * Lohnnebenkosten percentage that looks official is worse than an empty field,
 * because nobody checks it — and these are the company's own figures, which
 * only the company knows.
 */
export default async function CalculationDefaultsPage() {
  const defaults = await getCalculationDefaults();
  return (
    <FormPage
      back={{ href: '/dashboard/kalkulation', label: 'Kalkulation' }}
      title="Kalkulationsgrundlagen"
      width="narrow"
    >
      <CalculationDefaultsForm action={saveCalculationDefaults} defaults={defaults} />
    </FormPage>
  );
}
