import { FormPage } from '@/components/ui';
import { ComplaintForm } from '@/components/complaint-form';
import { listComplaintFormOptions } from '@/lib/data/complaints';
import { createComplaint } from '../actions';

export default async function NewComplaintPage() {
  const options = await listComplaintFormOptions();
  return (
    <FormPage
      back={{ href: '/dashboard/reklamationen', label: 'Reklamationen' }}
      title="Reklamation erfassen"
      description="Beanstandungen von Kunden, damit Nacharbeit und Verlauf nachvollziehbar bleiben."
    >
      <ComplaintForm
        options={options}
        action={createComplaint}
        submitLabel="Reklamation speichern"
      />
    </FormPage>
  );
}
