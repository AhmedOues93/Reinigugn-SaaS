import { notFound } from 'next/navigation';
import { ScheduleForm } from '@/components/schedule-form';
import { FormPage } from '@/components/ui';
import { getServiceSchedule, listAssignableEmployeeOptions } from '@/lib/data/jobs';
import { listCustomerOptions } from '@/lib/data/customers';
import { listCleaningObjectOptions } from '@/lib/data/cleaning-objects';
import { listActiveChecklistTemplateOptions } from '@/lib/data/checklists';
import { updateServiceSchedule } from '../../../actions';

export default async function EditSchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [schedule, customers, objects, employees, templates] = await Promise.all([
    getServiceSchedule(id),
    listCustomerOptions(),
    listCleaningObjectOptions(),
    listAssignableEmployeeOptions(),
    listActiveChecklistTemplateOptions(),
  ]);
  if (!schedule) notFound();

  return (
    <FormPage
      back={{ href: `/dashboard/planung/plaene/${id}`, label: schedule.name }}
      title="Plan bearbeiten"
      width="narrow"
    >
      <ScheduleForm
        schedule={schedule}
        customers={customers}
        objects={objects}
        employees={employees}
        templates={templates}
        action={updateServiceSchedule.bind(null, id)}
        submitLabel="Änderungen speichern"
      />
    </FormPage>
  );
}
