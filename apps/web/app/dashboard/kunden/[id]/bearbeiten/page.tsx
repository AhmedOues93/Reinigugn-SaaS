import { notFound } from 'next/navigation';
import { CustomerForm } from '@/components/customer-form';
import { FormPage } from '@/components/ui';
import { getCustomer } from '@/lib/data/customers';
import { updateCustomer } from '../../actions';

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await getCustomer(id);
  if (!customer) notFound();

  return (
    <FormPage
      back={{ href: `/dashboard/kunden/${customer.id}`, label: customer.name }}
      title="Kunde bearbeiten"
      stickyActions
    >
      <CustomerForm
        customer={customer}
        action={updateCustomer.bind(null, customer.id)}
        submitLabel="Änderungen speichern"
      />
    </FormPage>
  );
}
