import { CustomerForm } from '@/components/customer-form';
import { FormPage } from '@/components/ui';
import { createCustomer } from '../actions';
import { requireStaffCompany } from '@/lib/auth';

export default async function NewCustomerPage() {
  await requireStaffCompany();
  return (
    <FormPage
      back={{ href: '/dashboard/kunden', label: 'Kunden' }}
      title="Kunde anlegen"
      description="Stammdaten, Ansprechperson und Rechnungsdaten."
      stickyActions
    >
      <CustomerForm action={createCustomer} submitLabel="Kunde anlegen" />
    </FormPage>
  );
}
