import { notFound } from 'next/navigation';
import { CustomerForm } from '@/components/customer-form';
import { Card } from '@/components/ui';
import { getCustomer } from '@/lib/data/customers';
import { updateCustomer } from '../../actions';

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const customer = await getCustomer(id); if (!customer) notFound();
  return <div className="mx-auto max-w-3xl"><div className="mb-7"><h1 className="text-2xl font-semibold tracking-tight">Kunde bearbeiten</h1><p className="mt-2 text-slate-600">{customer.name}</p></div><Card className="p-5 sm:p-7"><CustomerForm customer={customer} action={updateCustomer.bind(null, customer.id)} submitLabel="Aenderungen speichern" /></Card></div>;
}
