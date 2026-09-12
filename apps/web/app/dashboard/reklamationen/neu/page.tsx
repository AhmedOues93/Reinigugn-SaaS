import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card } from '@/components/ui';
import { ComplaintForm } from '@/components/complaint-form';
import { listComplaintFormOptions } from '@/lib/data/complaints';
import { createComplaint } from '../actions';

export default async function NewComplaintPage() { const options = await listComplaintFormOptions(); return <div className="mx-auto max-w-4xl"><Link className="mb-5 inline-flex items-center gap-2 text-sm text-slate-600" href="/dashboard/reklamationen"><ArrowLeft className="size-4" />Zurueck zu Reklamationen</Link><h1 className="mb-6 text-2xl font-semibold">Reklamation erfassen</h1><Card className="p-6"><ComplaintForm options={options} action={createComplaint} submitLabel="Reklamation speichern" /></Card></div>; }
