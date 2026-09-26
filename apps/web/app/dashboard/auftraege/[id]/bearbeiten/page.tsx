import { notFound } from 'next/navigation';
import { JobForm } from '@/components/job-form';
import { FormPage } from '@/components/ui';
import { getJob, listAssignableEmployeeOptions } from '@/lib/data/jobs';
import { listCustomerOptions } from '@/lib/data/customers';
import { listCleaningObjectOptions } from '@/lib/data/cleaning-objects';
import { listActiveChecklistTemplateOptions } from '@/lib/data/checklists';
import { updateJob } from '../../actions';

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [job, customers, objects, employees, templates] = await Promise.all([
    getJob(id),
    listCustomerOptions(),
    listCleaningObjectOptions(),
    listAssignableEmployeeOptions(),
    listActiveChecklistTemplateOptions(),
  ]);
  if (!job) notFound();

  return (
    <FormPage
      back={{ href: `/dashboard/auftraege/${job.id}`, label: job.title }}
      title="Auftrag bearbeiten"
    >
      <JobForm
        job={job}
        customers={customers}
        objects={objects}
        employees={employees}
        templates={templates}
        action={updateJob.bind(null, job.id)}
        submitLabel="Änderungen speichern"
      />
    </FormPage>
  );
}
