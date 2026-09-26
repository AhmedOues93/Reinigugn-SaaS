import { FormPage } from '@/components/ui';
import { ComplaintForm } from '@/components/complaint-form';
import { listComplaintFormOptions } from '@/lib/data/complaints';
import { createComplaint } from '../actions';

export default async function NewComplaintPage({
  searchParams,
}: {
  searchParams: Promise<{ kunde?: string; objekt?: string; auftrag?: string; titel?: string }>;
}) {
  const query = await searchParams;
  const options = await listComplaintFormOptions();

  return (
    <FormPage
      back={{ href: '/dashboard/reklamationen', label: 'Reklamationen' }}
      title="Reklamation erfassen"
      description="Beanstandungen dokumentieren, Nacharbeit planen und den Verlauf nachvollziehbar halten."
    >
      <ComplaintForm
        complaint={{
          customer_id: query.kunde,
          cleaning_object_id: query.objekt,
          job_id: query.auftrag || null,
          title: query.titel,
          priority: 'NORMAL',
          status: 'OPEN',
        }}
        options={options}
        action={createComplaint}
        submitLabel="Reklamation speichern"
      />
    </FormPage>
  );
}
