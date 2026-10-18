import { notFound } from 'next/navigation';
import { CleaningObjectForm } from '@/components/cleaning-object-form';
import { FormPage } from '@/components/ui';
import { getCleaningObject } from '@/lib/data/cleaning-objects';
import { listCustomerOptions } from '@/lib/data/customers';
import { listActiveChecklistTemplateOptions } from '@/lib/data/checklists';
import { updateCleaningObject } from '../../actions';

export default async function EditObjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [object, customers, templates] = await Promise.all([
    getCleaningObject(id),
    listCustomerOptions(),
    listActiveChecklistTemplateOptions(),
  ]);
  if (!object) notFound();

  return (
    <FormPage
      back={{ href: `/dashboard/objekte/${object.id}`, label: object.name }}
      title="Objekt bearbeiten"
      stickyActions
    >
      <CleaningObjectForm
        object={object}
        customers={customers}
        templates={templates}
        action={updateCleaningObject.bind(null, object.id)}
        submitLabel="Änderungen speichern"
      />
    </FormPage>
  );
}
