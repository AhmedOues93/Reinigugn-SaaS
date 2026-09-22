import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Building2, Mail, MapPin, Pencil, Phone, Plus, Receipt, User } from 'lucide-react';
import { getCustomer, listCustomerObjects } from '@/lib/data/customers';
import { listQuotes } from '@/lib/data/sales';
import { listInvoices } from '@/lib/data/billing';
import { listServiceSchedules } from '@/lib/data/jobs';
import { BackLink, ButtonLink, Notice, PageHeader, Section } from '@/components/ui';
import { ComplaintHistory } from '@/components/complaint-history';
import { StatusBadge } from '@/components/status-badge';
import { StatusToggle } from '@/components/status-toggle';
import { PortalAccessPanel } from '@/components/portal-access-panel';
import { InvoiceStatusBadge } from '@/components/billing/invoice-status-badge';
import { listPendingPortalInvitations, listPortalContacts } from '@/lib/data/portal-access';
import { formatDate, formatMoney } from '@/lib/format';
import { inviteCustomerPortalContact, setCustomerActive } from '../actions';

function Line({ icon: Icon, children }: { icon: typeof User; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="break-anywhere min-w-0 text-foreground">{children}</span>
    </li>
  );
}

export default async function CustomerDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ success?: string }> }) {
  const { id } = await params;
  const { success } = await searchParams;
  const customer = await getCustomer(id);
  if (!customer) notFound();
  const [objects, portalContacts, portalInvitations, invoices, allQuotes, allSchedules] = await Promise.all([
    listCustomerObjects(customer.id),
    listPortalContacts(customer.id),
    listPendingPortalInvitations(customer.id),
    listInvoices({ customerId: customer.id }),
    listQuotes('all'),
    listServiceSchedules(),
  ]);
  const quotes = allQuotes.filter((quote) => quote.customer_id === customer.id || quote.created_customer_id === customer.id);
  const schedules = allSchedules.filter((schedule) => schedule.customer_id === customer.id);
  const acceptanceLabel: Record<string, string> = {
    KEINE_ABNAHME_ERFORDERLICH: 'Keine Abnahme',
    VOR_ORT_UNTERSCHRIFT: 'Unterschrift vor Ort',
    PORTAL_ABNAHME: 'Bestätigung im Kundenportal',
  };
  const billingLabel: Record<string, string> = {
    MONATSPAUSCHALE: 'Monatspauschale',
    PAUSCHALE_PRO_EINSATZ: 'Pauschale pro Einsatz',
    STUNDENSATZ: 'Stundensatz',
  };
  const open = invoices.filter((invoice) => invoice.displayStatus === 'ISSUED' || invoice.displayStatus === 'OVERDUE');
  const openCents = open.reduce((total, invoice) => total + invoice.gross_total_cents, 0);
  const address = [customer.billing_address, [customer.postal_code, customer.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  return (
    <div className="mx-auto min-w-0 max-w-5xl overflow-x-hidden">
      <BackLink href="/dashboard/kunden">Kunden</BackLink>
      {success && (
        <Notice tone="success" className="mb-5">
          {success}
        </Notice>
      )}
      <PageHeader
        title={customer.name}
        meta={
          <>
            <StatusBadge isActive={customer.is_active} />
            {customer.customer_number && <span className="text-sm tabular-nums text-muted-foreground">Kundennr. {customer.customer_number}</span>}
          </>
        }
        actions={
          <>
            <ButtonLink href={`/dashboard/kunden/${customer.id}/bearbeiten`} variant="outline">
              <Pencil className="size-4" aria-hidden="true" />
              Bearbeiten
            </ButtonLink>
            <ButtonLink href={`/dashboard/abrechnung/neu?kunde=${customer.id}`}>
              <Receipt className="size-4" aria-hidden="true" />
              Rechnung erstellen
            </ButtonLink>
            <StatusToggle id={customer.id} isActive={customer.is_active} noun="Kunde" action={setCustomerActive} />
          </>
        }
      />

      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-4">
          <section className="rounded-xl border border-border/80 bg-card p-5 shadow-card">
            <h2 className="mb-4 text-[15px] font-semibold">Kontakt & Rechnungsadresse</h2>
            <ul className="space-y-3">
              <Line icon={User}>{customer.contact_person || <span className="text-muted-foreground">Keine Ansprechperson</span>}</Line>
              <Line icon={Mail}>
                {customer.email ? (
                  <a className="text-primary hover:underline" href={`mailto:${customer.email}`}>
                    {customer.email}
                  </a>
                ) : (
                  <span className="text-warning">Keine E-Mail – Rechnungsversand nur manuell</span>
                )}
              </Line>
              <Line icon={Phone}>{customer.phone || <span className="text-muted-foreground">—</span>}</Line>
              <Line icon={MapPin}>{address || <span className="text-warning">Keine Rechnungsadresse</span>}</Line>
            </ul>
          </section>

          <section className="surface-ink rounded-xl p-5">
            <h2 className="text-[15px] font-semibold text-white">Offene Posten</h2>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-white">{formatMoney('de', openCents)}</p>
            <p className="mt-1 text-xs text-ink-muted">
              {open.length} offene {open.length === 1 ? 'Rechnung' : 'Rechnungen'} · {invoices.length} insgesamt
            </p>
          </section>

          {customer.notes && (
            <section>
              <h2 className="mb-2 text-[15px] font-semibold">Interne Notizen</h2>
              <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{customer.notes.replace(/^\[TESTDATEN\]\s*/i, '')}</p>
            </section>
          )}

        </aside>

        <div className="min-w-0 space-y-5">
          <Section
            title={`Objekte (${objects.length})`}
            action={
              <ButtonLink href={`/dashboard/objekte/neu?customer=${customer.id}`} variant="outline" size="sm">
                <Plus className="size-4" aria-hidden="true" />
                Objekt hinzufügen
              </ButtonLink>
            }
          >
            {objects.length === 0 ? (
              <p className="rounded-xl border border-dashed border-foreground/15 px-4 py-5 text-sm text-muted-foreground">Noch keine Objekte angelegt.</p>
            ) : (
              <ul className="grid gap-2.5 sm:grid-cols-2">
                {objects.map((object) => (
                  <li key={object.id}>
                    <Link
                      href={`/dashboard/objekte/${object.id}`}
                      className="group flex min-w-0 max-w-full items-start gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-card transition-colors hover:border-primary/40"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                        <Building2 className="size-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="break-anywhere block font-medium group-hover:text-primary">{object.name}</span>
                        <span className="block truncate text-sm text-muted-foreground">
                          {[object.street, object.postal_code, object.city].filter(Boolean).join(', ') || 'Keine Adresse'}
                        </span>
                      </span>
                      <span className="relative z-10 ms-auto flex shrink-0 items-center gap-2">
                        {!object.is_active && <StatusBadge isActive={false} />}
                        <span className="inline-flex min-h-10 items-center rounded-md border border-border bg-card px-3 text-xs font-semibold text-foreground shadow-sm">Ansehen</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={`Leistungspläne (${schedules.length})`}>
            {schedules.length === 0 ? (
              <p className="rounded-xl border border-dashed border-foreground/15 px-4 py-5 text-sm text-muted-foreground">
                Noch kein Leistungsplan für diesen Kunden.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {schedules.map((schedule) => {
                  const object = Array.isArray(schedule.cleaning_objects) ? schedule.cleaning_objects[0] : schedule.cleaning_objects;
                  return (
                    <li key={schedule.id}>
                      <Link
                        href={`/dashboard/planung/plaene/${schedule.id}`}
                        className="block min-w-0 rounded-xl border border-border/80 bg-card p-4 shadow-card transition-colors hover:border-primary/40"
                      >
                        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="break-anywhere font-medium">{schedule.name}</p>
                            <p className="mt-0.5 text-sm text-muted-foreground">{object?.name ?? 'Kein Objekt'}</p>
                          </div>
                          <span className="shrink-0 text-xs font-medium text-primary">Öffnen</span>
                        </div>
                        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                          <div>
                            <span className="text-muted-foreground">Kundenabnahme: </span>
                            <span className="font-medium">{acceptanceLabel[schedule.acceptance_policy ?? 'KEINE_ABNAHME_ERFORDERLICH'] ?? '—'}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Abrechnung: </span>
                            <span className="font-medium">{billingLabel[schedule.billing_mode ?? ''] ?? '—'}</span>
                          </div>
                        </div>
                        {schedule.acceptance_policy === 'PORTAL_ABNAHME' && portalContacts.length === 0 && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Für Portal-Abnahme zuerst einen Portalzugang für den Kunden einrichten.
                          </p>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section
            title="Angebote"
            action={<ButtonLink href={`/dashboard/kalkulation/neu?kunde=${customer.id}`} variant="outline" size="sm"><Plus className="size-4" aria-hidden="true" />Angebot erstellen</ButtonLink>}
          >
            {quotes.length === 0 ? (
              <p className="rounded-xl border border-dashed border-foreground/15 px-4 py-5 text-sm text-muted-foreground">Noch keine Angebote für diesen Kunden.</p>
            ) : (
              <ul className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-card">
                {quotes.slice(0, 6).map((quote) => (
                  <li key={quote.id} className="border-b border-border/70 p-3 last:border-0 sm:flex sm:items-center sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{quote.quote_number ?? 'Entwurf'} · {quote.title}</p>
                      <p className="text-sm text-muted-foreground">{formatMoney('de', quote.gross_total_cents, quote.currency)}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 sm:mt-0">
                      <ButtonLink href={`/dashboard/vertrieb/angebote/${quote.id}`} variant="outline" size="sm">Ansehen</ButtonLink>
                      {quote.status !== 'DRAFT' && <ButtonLink href={`/dashboard/vertrieb/angebote/${quote.id}/pdf`} target="_blank" rel="noreferrer" variant="outline" size="sm">PDF</ButtonLink>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="Rechnungen"
            action={
              invoices.length > 0 && (
                <Link href="/dashboard/abrechnung" className="text-sm font-medium text-primary hover:underline">
                  Alle Rechnungen
                </Link>
              )
            }
          >
            {invoices.length === 0 ? (
              <p className="rounded-xl border border-dashed border-foreground/15 px-4 py-5 text-sm text-muted-foreground">Noch keine Rechnungen für diesen Kunden.</p>
            ) : (
              <ul className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-card">
                {invoices.slice(0, 6).map((invoice) => (
                  <li key={invoice.id} className="border-b border-border/70 last:border-0">
                    <Link href={`/dashboard/abrechnung/${invoice.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-primary-soft/40">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium tabular-nums">{invoice.invoice_number ?? 'Entwurf'}</span>
                        <span className="block text-xs text-muted-foreground">
                          {formatDate('de', invoice.service_period_start)} – {formatDate('de', invoice.service_period_end)}
                        </span>
                      </span>
                      <span className="text-sm font-semibold tabular-nums">{formatMoney('de', invoice.gross_total_cents, invoice.currency)}</span>
                      <InvoiceStatusBadge status={invoice.displayStatus} locale="de" />
                      <span className="relative z-10 inline-flex min-h-10 items-center rounded-md border border-border bg-card px-3 text-xs font-semibold text-foreground shadow-sm">Ansehen</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <div id="portalzugang" className="scroll-mt-24"><PortalAccessPanel action={inviteCustomerPortalContact.bind(null, customer.id)} contacts={portalContacts} invitations={portalInvitations} /></div>
          <ComplaintHistory customerId={customer.id} />
        </div>
      </div>
    </div>
  );
}
