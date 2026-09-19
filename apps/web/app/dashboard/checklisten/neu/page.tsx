import { ChecklistTemplateForm } from '@/components/checklist-template-form';
import { FormPage } from '@/components/ui';
import { createChecklistTemplate } from '../actions';

export default function NewChecklistPage() {
  return (
    <FormPage
      back={{ href: '/dashboard/checklisten', label: 'Checklisten' }}
      title="Checkliste erstellen"
      description="Die Punkte erscheinen später in der Mitarbeiter-App in genau dieser Reihenfolge."
      width="narrow"
    >
      <ChecklistTemplateForm action={createChecklistTemplate} />
    </FormPage>
  );
}
