import { notFound } from 'next/navigation';
import { Card } from '@/components/ui';
import { getCurrentCompany } from '@/lib/auth';

const features: Record<string, { title: string; implemented?: boolean }> = {
  'urlaub-krankheit': { title: 'Urlaub & Krankheit' },
  nachrichten: { title: 'Nachrichten' },
  leistungsnachweise: { title: 'Leistungsnachweise', implemented: true },
  abrechnung: { title: 'Abrechnung' },
};

export default async function ComingSoonPage({ params }: { params: Promise<{ feature: string }> }) {
  const { membership } = await getCurrentCompany();
  if (membership?.role === 'EMPLOYEE') notFound();
  const { feature } = await params;
  const entry = features[feature];
  if (!entry) notFound();
  if (entry.implemented) return <div className="mx-auto max-w-3xl"><h1 className="text-2xl font-semibold tracking-tight">{entry.title}</h1><Card className="mt-6 p-8 text-center"><p className="text-lg font-semibold">Digitale Leistungsnachweise</p><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">Leistungsnachweise stehen in den Details der jeweiligen Aufträge zur Verfügung.</p></Card></div>;
  return <div className="mx-auto max-w-3xl"><h1 className="text-2xl font-semibold tracking-tight">{entry.title}</h1><Card className="mt-6 p-8 text-center"><p className="text-lg font-semibold">Kommt bald</p><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">Dieser Bereich wird in einer der nächsten Produktphasen freigeschaltet.</p></Card></div>;
}
