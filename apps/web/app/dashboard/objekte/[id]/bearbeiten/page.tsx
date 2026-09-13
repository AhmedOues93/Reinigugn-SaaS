import { notFound } from 'next/navigation';
import { CleaningObjectForm } from '@/components/cleaning-object-form';
import { Card } from '@/components/ui';
import { getCleaningObject } from '@/lib/data/cleaning-objects';
import { listCustomerOptions } from '@/lib/data/customers';
import { listActiveChecklistTemplateOptions } from '@/lib/data/checklists';
import { updateCleaningObject } from '../../actions';

export default async function EditObjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const [object, customers, templates] = await Promise.all([getCleaningObject(id), listCustomerOptions(), listActiveChecklistTemplateOptions()]); if (!object) notFound();
  return <div className="mx-auto max-w-3xl"><div className="mb-7"><h1 className="text-2xl font-semibold tracking-tight">Objekt bearbeiten</h1><p className="mt-2 text-slate-600">{object.name}</p></div><Card className="p-5 sm:p-7"><CleaningObjectForm object={object} customers={customers} templates={templates} action={updateCleaningObject.bind(null, object.id)} submitLabel="Änderungen speichern" /></Card></div>;
}
