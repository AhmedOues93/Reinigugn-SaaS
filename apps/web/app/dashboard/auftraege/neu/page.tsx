import { JobForm } from '@/components/job-form';
import { Card } from '@/components/ui';
import { listCustomerOptions } from '@/lib/data/customers';
import { listCleaningObjectOptions } from '@/lib/data/cleaning-objects';
import { listActiveEmployeeOptions } from '@/lib/data/jobs';
import { createJob } from '../actions';
export default async function NewJobPage() { const [customers, objects, employees] = await Promise.all([listCustomerOptions(), listCleaningObjectOptions(), listActiveEmployeeOptions()]); return <div className="mx-auto max-w-3xl"><h1 className="text-2xl font-semibold">Auftrag erstellen</h1><p className="mt-2 text-slate-600">Plane einen einzelnen Reinigungseinsatz.</p><Card className="mt-7 p-5 sm:p-7"><JobForm customers={customers} objects={objects} employees={employees} action={createJob} submitLabel="Auftrag erstellen" /></Card></div>; }
