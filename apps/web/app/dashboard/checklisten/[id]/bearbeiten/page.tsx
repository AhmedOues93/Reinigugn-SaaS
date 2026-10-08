import { notFound } from 'next/navigation';
import { ChecklistTemplateForm } from '@/components/checklist-template-form';
import { FormPage } from '@/components/ui';
import { getChecklistTemplate } from '@/lib/data/checklists';
import { updateChecklistTemplate } from '../../actions';

export default async function EditChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const template = await getChecklistTemplate(id);
  if (!template) notFound();

  return (
    <FormPage
      back={{ href: `/dashboard/checklisten/${template.id}`, label: template.name }}
      title="Checkliste bearbeiten"
      width="narrow"
    >
      <ChecklistTemplateForm
        template={template}
        action={updateChecklistTemplate.bind(null, template.id)}
      />
    </FormPage>
  );
}
