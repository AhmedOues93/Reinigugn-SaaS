import { notFound } from 'next/navigation';
import { Card } from '@/components/ui';
import { getCurrentCompany } from '@/lib/auth';

const features: Record<string, string> = {
  kunden: 'Kunden', objekte: 'Objekte', mitarbeiter: 'Mitarbeiter', planung: 'Planung', auftraege: 'Auftraege', arbeitszeiten: 'Arbeitszeiten', 'urlaub-krankheit': 'Urlaub & Krankheit', reklamationen: 'Reklamationen', nachrichten: 'Nachrichten', leistungsnachweise: 'Leistungsnachweise', abrechnung: 'Abrechnung',
};

export default async function ComingSoonPage({ params }: { params: Promise<{ feature: string }> }) {
  const { membership } = await getCurrentCompany();
  if (membership?.role === 'EMPLOYEE') notFound();
  const { feature } = await params;
  const title = features[feature];
  if (!title) notFound();
  return <div className="mx-auto max-w-3xl"><h1 className="text-2xl font-semibold tracking-tight">{title}</h1><Card className="mt-6 p-8 text-center"><p className="text-lg font-semibold">Kommt bald</p><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">Dieser Bereich wird in einer der naechsten Produktphasen freigeschaltet.</p></Card></div>;
}
