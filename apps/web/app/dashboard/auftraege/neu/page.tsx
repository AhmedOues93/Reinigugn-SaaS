import { JobForm } from '@/components/job-form';
import { FormPage } from '@/components/ui';
import { listCustomerOptions } from '@/lib/data/customers';
import { listCleaningObjectOptions } from '@/lib/data/cleaning-objects';
import { listActiveChecklistTemplateOptions } from '@/lib/data/checklists';
import { listAssignableEmployeeOptions } from '@/lib/data/jobs';
import { createJob } from '../actions';

export default async function NewJobPage() {
  const [customers, objects, employees, templates] = await Promise.all([
    listCustomerOptions(),
    listCleaningObjectOptions(),
    listAssignableEmployeeOptions(),
    listActiveChecklistTemplateOptions(),
  ]);

  return (
    <FormPage
      back={{ href: '/dashboard/auftraege', label: 'Aufträge' }}
      title="Auftrag erstellen"
      description="Ein einzelner Reinigungseinsatz. Wiederkehrende Einsätze laufen über einen Plan."
    >
      <JobForm
        customers={customers}
        objects={objects}
        employees={employees}
        templates={templates}
        action={createJob}
        submitLabel="Auftrag erstellen"
      />
    </FormPage>
  );
}
