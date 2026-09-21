import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FilePlus2, KeyRound, MapPin, Pencil, Phone, SprayCan, StickyNote, User } from 'lucide-react';
import { getCleaningObject } from '@/lib/data/cleaning-objects';
import { BackLink, ButtonLink, Notice, PageHeader } from '@/components/ui';
import { ComplaintHistory } from '@/components/complaint-history';
import { StatusBadge } from '@/components/status-badge';
import { StatusToggle } from '@/components/status-toggle';
import { setCleaningObjectActive } from '../actions';

/** A block of instructions the cleaner depends on. Prose, not a data row. */
function Instructions({
  title,
  icon: Icon,
  body,
  empty,
}: {
  title: string;
  icon: typeof KeyRound;
  body: string | null;
  empty: string;
}) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold">
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
        {title}
      </h2>
      <p className="break-anywhere whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
        {body || <span className="text-muted-foreground/70">{empty}</span>}
      </p>
    </section>
  );
}

export default async function ObjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string }>;
}) {
  const { id } = await params;
  const { success } = await searchParams;
  const object = await getCleaningObject(id);
  if (!object) notFound();
  const customer = object.customers as unknown as { id: string; name: string } | null;
  const address = [object.street, [object.postal_code, object.city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="mx-auto max-w-5xl">
      <BackLink href="/dashboard/objekte">Objekte</BackLink>
      {success && (
        <Notice tone="success" className="mb-5">
          {success}
        </Notice>
      )}

      <PageHeader
        title={object.name}
        meta={
          <>
            <StatusBadge isActive={object.is_active} />
            {customer && (
              <Link
                href={`/dashboard/kunden/${customer.id}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                {customer.name}
              </Link>
            )}
          </>
        }
        actions={
          <>
            {customer && (
              <ButtonLink href={`/dashboard/kalkulation/neu?kunde=${customer.id}&objekt=${object.id}`}>
                <FilePlus2 className="size-4" aria-hidden="true" />
                Angebot erstellen
              </ButtonLink>
            )}
            <ButtonLink href={`/dashboard/objekte/${object.id}/bearbeiten`} variant="outline">
              <Pencil className="size-4" aria-hidden="true" />
              Bearbeiten
            </ButtonLink>
            <StatusToggle
              id={object.id}
              isActive={object.is_active}
              noun="Objekt"
              action={setCleaningObjectActive}
            />
          </>
        }
      />

      <div className="grid items-start gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <section className="rounded-xl border border-border/80 bg-card p-5 shadow-card">
            <h2 className="mb-4 text-[15px] font-semibold">Adresse &amp; Kontakt vor Ort</h2>
            <ul className="space-y-3">
              <li className="flex items-start gap-3 text-sm">
                <MapPin
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="break-anywhere min-w-0">
                  {address || <span className="text-warning">Keine Adresse hinterlegt</span>}
                </span>
              </li>
              <li className="flex items-start gap-3 text-sm">
                <User className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="break-anywhere min-w-0">
                  {object.contact_person || (
                    <span className="text-muted-foreground">Keine Ansprechperson</span>
                  )}
                </span>
              </li>
              <li className="flex items-start gap-3 text-sm">
                <Phone
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="break-anywhere min-w-0">
                  {object.contact_phone || <span className="text-muted-foreground">—</span>}
                </span>
              </li>
            </ul>
          </section>
        </aside>

        <div className="min-w-0 space-y-8">
          {/* What someone standing at the door needs, in the order they need it. */}
          <div className="space-y-7 rounded-xl border border-border/80 bg-card p-5 shadow-card sm:p-6">
            <Instructions
              title="Zugang"
              icon={KeyRound}
              body={object.access_instructions}
              empty="Keine Zugangshinweise hinterlegt."
            />
            <Instructions
              title="Reinigung"
              icon={SprayCan}
              body={object.cleaning_instructions}
              empty="Keine Reinigungsanweisungen hinterlegt."
            />
            {object.notes && (
              <Instructions
                title="Interne Notizen"
                icon={StickyNote}
                body={object.notes}
                empty=""
              />
            )}
          </div>

          <ComplaintHistory objectId={object.id} />
        </div>
      </div>
    </div>
  );
}
