import { notFound } from 'next/navigation';
import { BookOpen, Check, FileText, Lock, ReceiptText } from 'lucide-react';
import { BackLink, Badge, ButtonLink, Card, DataRow, PageHeader } from '@/components/ui';
import { CalculationKpiBand } from '@/components/kalkulation/kpi-band';
import { CalculationLineEditor, RemoveLineButton } from '@/components/kalkulation/line-editor';
import {
  AssumptionsPanel,
  FinaliseAndContinueAction,
  QuoteFromCalculationForm,
  ReviseCalculationAction,
} from '@/components/kalkulation/workspace-panels';
import {
  formatBp,
  formatMinutes,
  frequencyLabels,
  getCalculation,
  getLeistungsverzeichnis,
  listCatalogItems,
  unitLabels,
  weekdayLabels,
  type CalculationLine,
} from '@/lib/data/kalkulation';
import { formatMoney } from '@/lib/format';
import {
  createQuoteFromCalculation,
  finaliseCalculationAndContinue,
  removeCalculationLine,
  reviseCalculation,
  saveCalculationLine,
  updateCalculation,
} from '../actions';

const tabs = [
  { key: 'leistung', label: 'Leistungen' },
  { key: 'kalkulation', label: 'Kalkulation' },
  { key: 'angebot', label: 'Angebot' },
] as const;

type TabKey = (typeof tabs)[number]['key'];

function money(cents: number, currency: string) {
  return formatMoney('de', cents, currency);
}

/**
 * The Kalkulation workspace.
 *
 * Six views over one calculation rather than one endless form: the office
 * works through service, then time, then cost, then price, and the six figures
 * that matter stay on screen throughout, because changing a productivity
 * without seeing what it does to the margin is how bad contracts get signed.
 */
export default async function CalculationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const tab = (tabs.find((entry) => entry.key === query.tab)?.key ?? 'leistung') as TabKey;

  const [calculation, catalog] = await Promise.all([getCalculation(id), listCatalogItems()]);
  if (!calculation) notFound();
  const verzeichnis = tab === 'angebot' ? await getLeistungsverzeichnis(id) : [];

  const isDraft = calculation.status === 'ENTWURF';
  const currency = calculation.currency;
  const recurring = calculation.lines.filter((line) => line.frequency !== 'EINMALIG');
  const oneOff = calculation.lines.filter((line) => line.frequency === 'EINMALIG');

  const lineRow = (line: CalculationLine, cells: React.ReactNode) => (
    <li key={line.id} className="grid gap-2 border-b border-border/70 px-4 py-3 last:border-0 sm:px-5">
      {cells}
    </li>
  );

  return (
    <div className="mx-auto max-w-6xl">
      <BackLink href="/dashboard/kalkulation">Kalkulationen</BackLink>

      <PageHeader
        title={calculation.title}
        description={`Version ${calculation.version}`}
        meta={
          <>
            {isDraft ? (
              <Badge tone="warning">Entwurf</Badge>
            ) : calculation.status === 'FINAL' ? (
              <Badge tone="success">
                <Lock className="size-3.5" aria-hidden="true" />
                Festgeschrieben
              </Badge>
            ) : (
              <Badge tone="neutral">Verworfen</Badge>
            )}
          </>
        }
        actions={!isDraft ? <ReviseCalculationAction action={reviseCalculation.bind(null, id)} /> : undefined}
      />

      <CalculationKpiBand calculation={calculation} />

      <div className="mb-4 grid grid-cols-4 gap-1 rounded-lg bg-muted/40 p-1 text-center text-[11px] font-semibold sm:text-xs">
        <span className="flex items-center justify-center gap-1 px-1 py-2 text-primary">
          <Check className="size-3.5" aria-hidden="true" />
          Kunde
        </span>
        <span className={tab === 'leistung' ? 'rounded-md bg-card px-1 py-2 text-primary shadow-sm' : 'px-1 py-2 text-muted-foreground'}>
          Leistungen
        </span>
        <span className={tab === 'kalkulation' ? 'rounded-md bg-card px-1 py-2 text-primary shadow-sm' : 'px-1 py-2 text-muted-foreground'}>
          Kalkulation
        </span>
        <span className={tab === 'angebot' ? 'rounded-md bg-card px-1 py-2 text-primary shadow-sm' : 'px-1 py-2 text-muted-foreground'}>
          Angebot
        </span>
      </div>

      {/* --- Leistung: what is performed, where and how often ---------------- */}
      {tab === 'leistung' && (
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
              <h2 className="text-[15px] font-semibold">Leistungspositionen</h2>
              {isDraft && (
                <ButtonLink href="/dashboard/kalkulation/leistungskatalog" variant="outline" size="sm">
                  <BookOpen className="size-4" aria-hidden="true" />
                  Aus Katalog hinzufügen
                </ButtonLink>
              )}
            </div>

            {calculation.lines.length === 0 ? (
              <p className="border-t border-border/70 px-4 py-6 text-sm text-muted-foreground sm:px-5">
                Noch keine Position erfasst.
              </p>
            ) : (
              /*
                A real table, because an office reads down a column: every
                Richtleistung under every other one, every monthly total in the
                same place. It scrolls sideways on a narrow screen rather than
                collapsing into cards — a calculation that reflows loses exactly
                the comparison it exists to support.
              */
              <div className="overflow-x-auto border-t border-border/70">
                <table className="w-full min-w-[60rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border/70 bg-subtle text-start">
                      <th scope="col" className="px-4 py-2.5 text-start text-xs font-medium text-muted-foreground sm:px-5">Bereich / Raum</th>
                      <th scope="col" className="px-3 py-2.5 text-start text-xs font-medium text-muted-foreground">Leistung</th>
                      <th scope="col" className="px-3 py-2.5 text-end text-xs font-medium text-muted-foreground">Menge</th>
                      <th scope="col" className="px-3 py-2.5 text-start text-xs font-medium text-muted-foreground">Einheit</th>
                      <th scope="col" className="px-3 py-2.5 text-end text-xs font-medium text-muted-foreground">Richtleistung</th>
                      <th scope="col" className="px-3 py-2.5 text-start text-xs font-medium text-muted-foreground">Turnus</th>
                      <th scope="col" className="px-3 py-2.5 text-end text-xs font-medium text-muted-foreground">Std./Mon.</th>
                      <th scope="col" className="px-3 py-2.5 text-end text-xs font-medium text-muted-foreground">€/Monat</th>
                      {isDraft && <th scope="col" className="w-12 px-2 py-2.5"><span className="sr-only">Aktionen</span></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {calculation.lines.map((line) => (
                      <tr key={line.id} className="align-top transition-colors hover:bg-subtle/60">
                        <td className="px-4 py-3 font-medium sm:px-5">
                          {line.area_name}
                          {line.service_weekdays && line.service_weekdays.length > 0 && (
                            <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                              {line.service_weekdays
                                .map((day) => weekdayLabels.find((entry) => entry.value === day)?.short ?? day)
                                .join(', ')}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {line.service_name}
                          {line.override_reason && (
                            <span className="mt-0.5 block text-xs font-medium text-warning">
                              Zeit manuell: {line.override_reason}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-end tabular-nums">{line.quantity.toLocaleString('de-DE')}</td>
                        <td className="px-3 py-3 text-muted-foreground">{unitLabels[line.calculation_unit]}</td>
                        <td className="px-3 py-3 text-end tabular-nums text-muted-foreground">
                          {line.productivity_per_hour != null
                            ? `${line.productivity_per_hour.toLocaleString('de-DE')} m²/h`
                            : line.minutes_per_unit != null
                              ? `${line.minutes_per_unit.toLocaleString('de-DE')} Min.`
                              : '–'}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {line.frequency === 'PRO_WOCHE' || line.frequency === 'PRO_MONAT'
                            ? `${line.frequency_count.toLocaleString('de-DE')}× ${frequencyLabels[line.frequency]}`
                            : frequencyLabels[line.frequency]}
                        </td>
                        <td className="px-3 py-3 text-end tabular-nums">
                          {line.frequency === 'EINMALIG'
                            ? '–'
                            : (line.monthly_minutes / 60).toLocaleString('de-DE', { maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-3 text-end font-medium tabular-nums">
                          {money(
                            line.frequency === 'EINMALIG' ? line.one_off_price_cents : line.proposed_price_cents_month,
                            currency,
                          )}
                        </td>
                        {isDraft && (
                          <td className="px-2 py-2">
                            <RemoveLineButton
                              action={removeCalculationLine.bind(null, id, line.id)}
                              label={`${line.area_name} · ${line.service_name}`}
                            />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-subtle font-semibold">
                      <td className="px-4 py-3 sm:px-5" colSpan={6}>
                        Gesamt
                      </td>
                      <td className="px-3 py-3 text-end tabular-nums">
                        {(calculation.monthly_minutes / 60).toLocaleString('de-DE', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-3 text-end tabular-nums">
                        {money(calculation.selling_price_cents_month, currency)}
                      </td>
                      {isDraft && <td />}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>

          {isDraft && (
            <CalculationLineEditor
              action={saveCalculationLine.bind(null, id, null)}
              catalog={catalog}
            />
          )}
        </div>
      )}

      {/* --- Zeit: how the productivity became hours ------------------------- */}
      {tab === 'kalkulation' && (
        <Card className="overflow-hidden">
          <h2 className="px-4 pt-4 text-[15px] font-semibold sm:px-5">Zeitbedarf</h2>
          <p className="px-4 pb-1 pt-1 text-sm text-muted-foreground sm:px-5">
            Aus Menge und Richtleistung berechnet. Rüstzeit wird je Einsatz zusätzlich angesetzt.
          </p>
          <ul className="mt-3">
            {calculation.lines.map((line) =>
              lineRow(
                line,
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                  <span className="min-w-0 font-medium">{line.area_name} · {line.service_name}</span>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {formatMinutes(line.minutes_per_service)} je Einsatz ·{' '}
                    {line.services_per_month.toLocaleString('de-DE', { maximumFractionDigits: 2 })} Einsätze/Monat
                  </span>
                  <span className="font-semibold tabular-nums">
                    {line.frequency === 'EINMALIG'
                      ? `${formatMinutes(line.minutes_per_service)} einmalig`
                      : `${formatMinutes(line.monthly_minutes)} /Monat`}
                  </span>
                </div>,
              ),
            )}
          </ul>
          <dl className="divide-y divide-border/70 border-t border-border px-4 sm:px-5">
            <DataRow
              label="Rüstzeit je Einsatz"
              value={`${calculation.setup_minutes_per_visit.toLocaleString('de-DE')} Min.`}
            />
            <DataRow label="Einsätze pro Woche" value={calculation.visits_per_week.toLocaleString('de-DE')} />
            <DataRow label="Produktive Stunden pro Monat" value={formatMinutes(calculation.monthly_minutes)} />
            {calculation.one_off_minutes > 0 && (
              <DataRow label="Einmalige Leistungen" value={formatMinutes(calculation.one_off_minutes)} />
            )}
          </dl>
        </Card>
      )}

      {/* --- Kosten: the cost side, component by component ------------------- */}
      {tab === 'kalkulation' && (
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold">Personalkosten je produktiver Stunde</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Kalkulationslohn × (1 + Lohnnebenkosten) ÷ produktiver Anteil × (1 + Gemeinkosten)
            </p>
            <dl className="mt-3 divide-y divide-border/70">
              <DataRow label="Kalkulationslohn" value={`${money(calculation.wage_cents_per_hour, currency)} / Std.`} />
              <DataRow label="Lohnnebenkosten" value={formatBp(calculation.ancillary_rate_bp)} />
              <DataRow label="Produktiver Anteil der bezahlten Zeit" value={formatBp(calculation.productive_rate_bp)} />
              <DataRow label="Gemeinkostenzuschlag" value={formatBp(calculation.overhead_rate_bp)} />
              <DataRow
                label="= Kosten je produktiver Stunde"
                value={
                  <span className="font-semibold tabular-nums">
                    {money(calculation.personnel_cost_cents_per_hour, currency)}
                  </span>
                }
              />
            </dl>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Dies ist ein Kalkulationsmodell, keine Lohnabrechnung. Es berechnet keine Vergütung und
              erhebt keinen Anspruch, lohnsteuer- oder sozialversicherungsrechtliche Vorgaben
              abzubilden.
            </p>
          </Card>

          {/*
            Where the productive share came from. Without this the most
            consequential number in the calculation is a percentage with no
            provenance, and nobody can tell a considered figure from a guess.
          */}
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold">Herkunft des produktiven Anteils</h2>
            {calculation.productive_rate_is_manual ? (
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Der produktive Anteil von {formatBp(calculation.productive_rate_bp)} wurde für diese
                Kalkulation direkt vorgegeben und nicht aus Ausfalltagen berechnet.
              </p>
            ) : (
              <>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  (Anwesenheitstage ÷ Arbeitstage) × (1 − unproduktive Minuten ÷ Minuten je
                  Arbeitstag)
                </p>
                <dl className="mt-3 divide-y divide-border/70">
                  <DataRow
                    label="Arbeitstage pro Jahr"
                    value={`${(calculation.working_days_per_week * 52).toLocaleString('de-DE', { maximumFractionDigits: 0 })} (${calculation.working_days_per_week.toLocaleString('de-DE')} je Woche)`}
                  />
                  <DataRow label="Urlaubstage" value={calculation.vacation_days.toLocaleString('de-DE')} />
                  <DataRow label="Feiertage" value={calculation.public_holidays.toLocaleString('de-DE')} />
                  <DataRow label="Krankheitstage" value={calculation.sick_days.toLocaleString('de-DE')} />
                  <DataRow label="Schulung und Sonstiges" value={calculation.training_days.toLocaleString('de-DE')} />
                  <DataRow
                    label="Unproduktive Minuten je Arbeitstag"
                    value={`${calculation.unproductive_minutes_per_day.toLocaleString('de-DE')} Min. von ${Math.round((calculation.weekly_hours / Math.max(calculation.working_days_per_week, 0.1)) * 60).toLocaleString('de-DE')} Min.`}
                  />
                  <DataRow
                    label="= Produktiver Anteil"
                    value={<span className="font-semibold tabular-nums">{formatBp(calculation.productive_rate_bp)}</span>}
                  />
                </dl>
              </>
            )}
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Diese Angaben gehören zu dieser Kalkulation. Eine spätere Änderung der
              Unternehmens&shy;grundlagen verändert sie nicht.
            </p>
          </Card>

          <Card className="p-5">
            <h2 className="text-[15px] font-semibold">Monatliche Kosten</h2>
            <dl className="mt-3 divide-y divide-border/70">
              <DataRow label="Personal" value={money(calculation.personnel_cost_cents_month, currency)} />
              <DataRow label="Material" value={money(calculation.material_cost_cents_month, currency)} />
              <DataRow label="Maschinen" value={money(calculation.machine_cost_cents_month, currency)} />
              <DataRow label="Fahrt" value={money(calculation.travel_cost_cents_month, currency)} />
              <DataRow label="Sonstiges" value={money(calculation.other_cost_cents_month, currency)} />
              <DataRow
                label="Gesamtkosten pro Monat"
                value={
                  <span className="font-semibold tabular-nums">
                    {money(calculation.total_cost_cents_month, currency)}
                  </span>
                }
              />
              <DataRow label="Gesamtkosten je Einsatz" value={money(calculation.total_cost_cents_visit, currency)} />
              {calculation.one_off_cost_cents > 0 && (
                <DataRow label="Einmalige Leistungen" value={money(calculation.one_off_cost_cents, currency)} />
              )}
            </dl>
          </Card>

          {isDraft && <AssumptionsPanel action={updateCalculation.bind(null, id)} calculation={calculation} />}
        </div>
      )}

      {/* --- Preis: proposal, override, and the markup/margin distinction ---- */}
      {tab === 'kalkulation' && (
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold">Preisbildung</h2>
            <dl className="mt-3 divide-y divide-border/70">
              <DataRow label="Kosten pro Monat" value={money(calculation.total_cost_cents_month, currency)} />
              <DataRow label="Zielmarge" value={formatBp(calculation.target_margin_bp)} />
              <DataRow
                label="Vorschlag (Kosten ÷ (1 − Marge))"
                value={money(calculation.proposed_price_cents_month, currency)}
              />
              <DataRow
                label={
                  calculation.price_override_cents_month != null
                    ? 'Grundpreis (manuell gesetzt)'
                    : 'Grundpreis'
                }
                value={money(calculation.base_price_cents_month, currency)}
              />
              {calculation.surcharge_cents_month > 0 && (
                <DataRow
                  label="+ Zuschläge für den Kunden"
                  value={money(calculation.surcharge_cents_month, currency)}
                />
              )}
              <DataRow
                label="Verkaufspreis pro Monat"
                value={
                  <span className="font-semibold tabular-nums">
                    {money(calculation.selling_price_cents_month, currency)}
                  </span>
                }
              />
              {calculation.price_override_reason && (
                <DataRow label="Abweichung begründet mit" value={calculation.price_override_reason} />
              )}
              {calculation.one_off_price_cents > 0 && (
                <DataRow label="Einmalige Leistungen" value={money(calculation.one_off_price_cents, currency)} />
              )}
            </dl>
          </Card>

          {/*
            Surcharges, stated as what they are. They raise revenue and
            therefore the margin — which is correct, because the cost they
            relate to is either already in the cost side or is not a cost.
          */}
          {(calculation.surcharge_cents_month > 0 || calculation.surcharge_note) && (
            <Card className="p-5">
              <h2 className="text-[15px] font-semibold">Zuschläge für den Kunden</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Aufschläge auf den Grundpreis. Sie sind keine Kosten — die eigenen Fahrt- und
                Sachkosten stehen im Reiter „Kosten“ und sind über die Marge gedeckt.
              </p>
              <dl className="mt-3 divide-y divide-border/70">
                {calculation.surcharge_travel_cents_month > 0 && (
                  <DataRow label="Anfahrtspauschale" value={money(calculation.surcharge_travel_cents_month, currency)} />
                )}
                {calculation.surcharge_small_order_cents_month > 0 && (
                  <DataRow
                    label="Kleinauftragszuschlag"
                    value={money(calculation.surcharge_small_order_cents_month, currency)}
                  />
                )}
                {calculation.surcharge_offpeak_bp > 0 && (
                  <DataRow
                    label="Nacht-, Sonn- und Feiertagszuschlag"
                    value={`${formatBp(calculation.surcharge_offpeak_bp)} auf ${money(calculation.base_price_cents_month, currency)}`}
                  />
                )}
                <DataRow
                  label="Summe Zuschläge"
                  value={
                    <span className="font-semibold tabular-nums">
                      {money(calculation.surcharge_cents_month, currency)}
                    </span>
                  }
                />
              </dl>
              {calculation.surcharge_note && (
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {calculation.surcharge_note}
                </p>
              )}
            </Card>
          )}

          <Card className="p-5">
            <h2 className="text-[15px] font-semibold">Erzielter Stundensatz</h2>
            <dl className="mt-3 divide-y divide-border/70">
              <DataRow
                label="Verkaufspreis je produktiver Stunde"
                value={
                  <span className="font-semibold tabular-nums">
                    {money(calculation.price_cents_per_productive_hour, currency)}
                  </span>
                }
              />
              <DataRow
                label="Mindeststundensatz (selbst gesetzt)"
                value={
                  calculation.min_hourly_rate_cents > 0
                    ? money(calculation.min_hourly_rate_cents, currency)
                    : 'nicht hinterlegt'
                }
              />
              {calculation.min_hourly_rate_cents > 0 && (
                <DataRow
                  label="Entspricht einem Monatspreis von"
                  value={money(calculation.min_price_cents_month, currency)}
                />
              )}
              <DataRow
                label="Kostendeckung erfordert mindestens"
                value={`${money(calculation.break_even_rate_cents_per_hour, currency)} / Std.`}
              />
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="text-[15px] font-semibold">Marge und Aufschlag sind nicht dasselbe</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Die Marge misst den Gewinn am <em>Preis</em>, der Aufschlag misst ihn an den{' '}
              <em>Kosten</em>. Beide Zahlen gehören zur selben Kalkulation und sind verschieden —
              „Kosten plus 30 %“ ergibt keine 30 % Marge, sondern nur rund 23 %.
            </p>
            <dl className="mt-3 divide-y divide-border/70">
              <DataRow label="Marge = (Preis − Kosten) ÷ Preis" value={formatBp(calculation.margin_bp)} />
              <DataRow label="Aufschlag = (Preis − Kosten) ÷ Kosten" value={formatBp(calculation.markup_bp)} />
              <DataRow
                label="Deckungsbeitrag pro Monat"
                value={money(calculation.contribution_cents_month, currency)}
              />
            </dl>
          </Card>
        </div>
      )}

      {/* --- Wirtschaftlichkeit: the year, and the floor under the price ----- */}
      {tab === 'kalkulation' && (
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold">Erwartete Wirtschaftlichkeit</h2>
            <dl className="mt-3 divide-y divide-border/70">
              <DataRow label="Umsatz pro Monat" value={money(calculation.selling_price_cents_month, currency)} />
              <DataRow label="Umsatz pro Jahr" value={money(calculation.selling_price_cents_month * 12, currency)} />
              <DataRow label="Kosten pro Monat" value={money(calculation.total_cost_cents_month, currency)} />
              <DataRow label="Kosten pro Jahr" value={money(calculation.total_cost_cents_month * 12, currency)} />
              <DataRow
                label="Deckungsbeitrag pro Monat"
                value={money(calculation.contribution_cents_month, currency)}
              />
              <DataRow
                label="Deckungsbeitrag pro Jahr"
                value={
                  <span className="font-semibold tabular-nums">
                    {money(calculation.contribution_cents_month * 12, currency)}
                  </span>
                }
              />
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="text-[15px] font-semibold">Untergrenze</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Unter diesem Stundensatz deckt der Auftrag seine eigenen Kosten nicht mehr.
            </p>
            <dl className="mt-3 divide-y divide-border/70">
              <DataRow
                label="Mindeststundensatz (Kostendeckung)"
                value={
                  <span className="font-semibold tabular-nums">
                    {money(calculation.break_even_rate_cents_per_hour, currency)} / Std.
                  </span>
                }
              />
              <DataRow
                label="Kosten je produktiver Stunde"
                value={money(calculation.cost_cents_per_productive_hour, currency)}
              />
            </dl>
          </Card>
        </div>
      )}

      {/* --- Dokumente: what leaves the building ----------------------------- */}
      {tab === 'angebot' && (
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="px-4 pt-4 sm:px-5">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold">
                <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
                Leistungsverzeichnis
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Was der Kunde erhält. Enthält bewusst keine Kosten, Löhne oder Margen.
              </p>
            </div>
            <ul className="mt-3">
              {verzeichnis.map((row) => (
                <li key={row.line_position} className="border-b border-border/70 px-4 py-3 last:border-0 sm:px-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                    <span className="font-medium">{row.area_name}</span>
                    <span className="text-sm text-muted-foreground">
                      {row.quantity.toLocaleString('de-DE')} {unitLabels[row.calculation_unit]}
                    </span>
                    <span className="text-sm">{row.frequency_label}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{row.service_name}</p>
                  {row.scope_note && <p className="mt-1 text-sm leading-6">{row.scope_note}</p>}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold">
              <ReceiptText className="size-4 text-muted-foreground" aria-hidden="true" />
              Angebot erstellen
            </h2>
            {calculation.status === 'FINAL' ? (
              <QuoteFromCalculationForm
                action={createQuoteFromCalculation.bind(null, id)}
                defaultTitle={calculation.title}
              />
            ) : (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Erst festschreiben. Ein Angebot muss auf Zahlen stehen, die sich nicht mehr ändern
                können — sonst verschiebt eine spätere Lohnanpassung rückwirkend das, was der Kunde
                bekommen hat.
              </p>
            )}
          </Card>
        </div>
      )}

      {tab === 'leistung' && calculation.lines.length > 0 && (
        <div className="mt-5 flex justify-end">
          <ButtonLink href={`/dashboard/kalkulation/${id}?tab=kalkulation`} className="w-full justify-center sm:w-auto">
            Weiter zur Kalkulation
          </ButtonLink>
        </div>
      )}

      {tab === 'kalkulation' && isDraft && (
        <Card className="mt-5 p-4 sm:p-5">
          <h2 className="font-semibold">Kalkulation prüfen</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Wenn Zeit, Kosten und Verkaufspreis stimmen, geht es direkt zum Angebot. ReinPlan friert die Kalkulation dabei automatisch ein.
          </p>
          <FinaliseAndContinueAction action={finaliseCalculationAndContinue.bind(null, id)} />
        </Card>
      )}

      {tab === 'kalkulation' && !isDraft && (
        <div className="mt-5 flex justify-end">
          <ButtonLink href={`/dashboard/kalkulation/${id}?tab=angebot`} className="w-full justify-center sm:w-auto">
            Weiter zum Angebot
          </ButtonLink>
        </div>
      )}

      {oneOff.length > 0 && tab === 'leistung' && (
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          {oneOff.length} einmalige {oneOff.length === 1 ? 'Leistung' : 'Leistungen'} werden separat
          abgerechnet und sind nicht Teil der monatlichen Zahlen. {recurring.length} wiederkehrende{' '}
          {recurring.length === 1 ? 'Position' : 'Positionen'} bilden den Monatswert.
        </p>
      )}
    </div>
  );
}
