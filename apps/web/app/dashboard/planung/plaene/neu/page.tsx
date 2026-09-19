import { ScheduleForm } from '@/components/schedule-form';
import { FormPage } from '@/components/ui';
import { listCustomerOptions } from '@/lib/data/customers';
import { listCleaningObjectOptions } from '@/lib/data/cleaning-objects';
import { listActiveChecklistTemplateOptions } from '@/lib/data/checklists';
import { listActiveEmployeeOptions } from '@/lib/data/jobs';
import { createServiceSchedule } from '../../actions';

export default async function NewSchedulePage() {
  const [customers, objects, employees, templates] = await Promise.all([
    listCustomerOptions(),
    listCleaningObjectOptions(),
    listActiveEmployeeOptions(),
    listActiveChecklistTemplateOptions(),
  ]);

  return (
    <FormPage
      back={{ href: '/dashboard/planung/plaene', label: 'Wiederkehrende Pläne' }}
      title="Wiederkehrenden Plan erstellen"
      description="Der Rhythmus wird einmal festgelegt und erzeugt die nächsten acht Wochen an Einsätzen."
      width="narrow"
    >
      <ScheduleForm
        customers={customers}
        objects={objects}
        employees={employees}
        templates={templates}
        action={createServiceSchedule}
        submitLabel="Plan erstellen"
      />
    </FormPage>
  );
}
