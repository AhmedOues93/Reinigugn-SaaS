import { notFound } from 'next/navigation';
import { CustomerForm } from '@/components/customer-form';
import { Card } from '@/components/ui';
import { getCustomer } from '@/lib/data/customers';
import { updateCustomer } from '../../actions';

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const customer = await getCustomer(id); if (!customer) notFound();
  return <div className="mx-auto max-w-5xl"><div className="mb-7"><h1 className="text-[1.75rem] font-semibold leading-tight">Kunde bearbeiten</h1><p className="mt-2 text-muted-foreground">{customer.name}</p></div><Card className="px-5 pb-0 pt-6 sm:px-6"><CustomerForm customer={customer} action={updateCustomer.bind(null, customer.id)} submitLabel="Änderungen speichern" /></Card></div>;
}
