import { CleaningObjectForm } from '@/components/cleaning-object-form';
import { Card } from '@/components/ui';
import { listCustomerOptions } from '@/lib/data/customers';
import { listActiveChecklistTemplateOptions } from '@/lib/data/checklists';
import { createCleaningObject } from '../actions';

export default async function NewObjectPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const { customer } = await searchParams; const [customers, templates] = await Promise.all([listCustomerOptions(), listActiveChecklistTemplateOptions()]);
  return <div className="mx-auto max-w-3xl"><div className="mb-7"><h1 className="text-2xl font-semibold tracking-tight">Objekt anlegen</h1><p className="mt-2 text-slate-600">Ordne ein Reinigungsobjekt einem Kunden zu.</p></div><Card className="p-5 sm:p-7"><CleaningObjectForm object={{ customer_id: customer }} customers={customers} templates={templates} action={createCleaningObject} submitLabel="Objekt anlegen" /></Card></div>;
}
