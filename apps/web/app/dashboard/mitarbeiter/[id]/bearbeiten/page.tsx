import { notFound } from 'next/navigation';
import { EmployeeForm } from '@/components/employee-form';
import { Card } from '@/components/ui';
import { getEmployee } from '@/lib/data/employees';
import { requireStaffCompany } from '@/lib/auth';
import { updateEmployee } from '../../actions';

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const [{ role }, employee] = await Promise.all([requireStaffCompany(), getEmployee(id)]); if (!employee) notFound();
  if (role === 'OFFICE' && employee.role !== 'EMPLOYEE') notFound();
  return <div className="mx-auto max-w-3xl"><div className="mb-7"><h1 className="text-2xl font-semibold tracking-tight">Mitarbeiter bearbeiten</h1><p className="mt-2 text-slate-600">Stammdaten, Rolle und Arbeitsdaten aktualisieren.</p></div><Card className="p-5 sm:p-7"><EmployeeForm employee={employee} action={updateEmployee.bind(null, employee.id)} currentRole={role} invitation={false} submitLabel="Änderungen speichern" /></Card></div>;
}
