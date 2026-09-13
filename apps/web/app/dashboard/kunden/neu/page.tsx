import { CustomerForm } from '@/components/customer-form';
import { Card } from '@/components/ui';
import { createCustomer } from '../actions';
import { requireStaffCompany } from '@/lib/auth';

export default async function NewCustomerPage() {
  await requireStaffCompany();
  return <div className="mx-auto max-w-3xl"><div className="mb-7"><h1 className="text-2xl font-semibold tracking-tight">Kunde anlegen</h1><p className="mt-2 text-slate-600">Lege einen Kunden für dein Unternehmen an.</p></div><Card className="p-5 sm:p-7"><CustomerForm action={createCustomer} submitLabel="Kunde anlegen" /></Card></div>;
}
