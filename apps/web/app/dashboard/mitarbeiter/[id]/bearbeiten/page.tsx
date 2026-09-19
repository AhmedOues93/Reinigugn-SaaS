import { notFound } from 'next/navigation';
import { EmployeeForm } from '@/components/employee-form';
import { FormPage } from '@/components/ui';
import { getEmployee } from '@/lib/data/employees';
import { requireStaffCompany } from '@/lib/auth';
import { updateEmployee } from '../../actions';

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ role }, employee] = await Promise.all([requireStaffCompany(), getEmployee(id)]);
  if (!employee) notFound();
  if (role === 'OFFICE' && employee.role !== 'EMPLOYEE') notFound();

  const profile = Array.isArray(employee.profiles) ? employee.profiles[0] : employee.profiles;
  const name =
    [
      profile?.first_name ?? employee.invited_first_name,
      profile?.last_name ?? employee.invited_last_name,
    ]
      .filter(Boolean)
      .join(' ') || 'Mitarbeiter';

  return (
    <FormPage
      back={{ href: `/dashboard/mitarbeiter/${employee.id}`, label: name }}
      title="Mitarbeiter bearbeiten"
      description="Stammdaten, Rolle und Arbeitsdaten aktualisieren."
    >
      <EmployeeForm
        employee={employee}
        action={updateEmployee.bind(null, employee.id)}
        currentRole={role}
        invitation={false}
        submitLabel="Änderungen speichern"
      />
    </FormPage>
  );
}
