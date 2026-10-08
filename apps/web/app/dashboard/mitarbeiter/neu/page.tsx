import { EmployeeForm } from '@/components/employee-form';
import { FormPage } from '@/components/ui';
import { requireStaffCompany } from '@/lib/auth';
import { inviteEmployee } from '../actions';

export default async function NewEmployeePage() {
  const { role } = await requireStaffCompany();
  return (
    <FormPage
      back={{ href: '/dashboard/mitarbeiter', label: 'Mitarbeiter' }}
      title="Mitarbeiter hinzufügen"
      description="Stammdaten festlegen und eine sichere Einladung versenden."
    >
      <EmployeeForm
        action={inviteEmployee}
        currentRole={role}
        invitation
        submitLabel="Einladung erstellen"
      />
    </FormPage>
  );
}
