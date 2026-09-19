import { CustomerForm } from '@/components/customer-form';
import { Card } from '@/components/ui';
import { createCustomer } from '../actions';
import { requireStaffCompany } from '@/lib/auth';

export default async function NewCustomerPage() {
  await requireStaffCompany();
  return <div className="mx-auto max-w-5xl"><div className="mb-7"><h1 className="text-[1.75rem] font-semibold leading-tight">Kunde anlegen</h1><p className="mt-2 text-muted-foreground">Stammdaten, Ansprechperson und Rechnungsdaten.</p></div><Card className="px-5 pb-0 pt-6 sm:px-6"><CustomerForm action={createCustomer} submitLabel="Kunde anlegen" /></Card></div>;
}
