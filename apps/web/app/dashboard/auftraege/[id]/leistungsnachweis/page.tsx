import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getServiceRecord } from '@/lib/data/service-record';
import { ServiceRecordView } from '@/components/service-record-view';

export default async function ServiceRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const record = await getServiceRecord(id); if (!record) notFound();
  return <div className="mx-auto max-w-5xl"><Link href={`/dashboard/auftraege/${id}`} className="mb-5 inline-flex items-center gap-2 text-sm text-slate-600"><ArrowLeft className="size-4" />Zurück zum Auftrag</Link><ServiceRecordView record={record} /></div>;
}
