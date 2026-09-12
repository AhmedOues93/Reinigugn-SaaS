import { EmployeeForm } from '@/components/employee-form';
import { Card } from '@/components/ui';
import { requireStaffCompany } from '@/lib/auth';
import { inviteEmployee } from '../actions';

export default async function NewEmployeePage() {
  const { role } = await requireStaffCompany();
  return <div className="mx-auto max-w-3xl"><div className="mb-7"><h1 className="text-2xl font-semibold tracking-tight">Mitarbeiter hinzufügen</h1><p className="mt-2 text-slate-600">Lege Stammdaten fest und sende eine sichere Einladung.</p></div><Card className="p-5 sm:p-7"><EmployeeForm action={inviteEmployee} currentRole={role} invitation submitLabel="Einladung erstellen" /></Card></div>;
}
