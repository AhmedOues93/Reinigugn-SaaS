import { CleaningObjectForm } from '@/components/cleaning-object-form';
import { FormPage } from '@/components/ui';
import { listCustomerOptions } from '@/lib/data/customers';
import { listActiveChecklistTemplateOptions } from '@/lib/data/checklists';
import { createCleaningObject } from '../actions';

export default async function NewObjectPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  const { customer } = await searchParams;
  const [customers, templates] = await Promise.all([
    listCustomerOptions(),
    listActiveChecklistTemplateOptions(),
  ]);

  return (
    <FormPage
      back={{ href: '/dashboard/objekte', label: 'Objekte' }}
      title="Objekt anlegen"
      description="Ein Reinigungsobjekt gehört immer zu einem Kunden."
      stickyActions
    >
      <CleaningObjectForm
        object={{ customer_id: customer }}
        customers={customers}
        templates={templates}
        action={createCleaningObject}
        submitLabel="Objekt anlegen"
      />
    </FormPage>
  );
}
