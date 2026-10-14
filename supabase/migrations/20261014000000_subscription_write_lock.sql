-- Nach dem Testzeitraum ohne Abo: lesen ja, weiterarbeiten nein.
--
-- Bisher lief das Produkt nach Ablauf des Testzeitraums unverändert weiter.
-- `isSubscriptionUsable()` in lib/subscription.ts gab es schon, mit Unit-Tests,
-- aber angewendet wurde es nirgends -- nachgeprüft: in middleware.ts und
-- lib/auth.ts kommt es nicht vor, und `trial_ends_at` wird ausserhalb der
-- Abo-Seite und des Checkouts nirgends gelesen. Der Testzeitraum war damit
-- eine Anzeige, keine Grenze.
--
-- WAS GESPERRT WIRD, UND WAS NICHT
--
-- Gesperrt wird das *Weiterarbeiten im Büro*: neue Kunden, Objekte, Einsätze,
-- Turnusse, Zuweisungen, Checklistenvorlagen, Qualitätskontrollen. Das ist
-- die Arbeit, für die ein Betrieb bezahlt.
--
-- Bewusst NICHT gesperrt, jeweils aus einem Grund:
--
--   job_time_entries, job_time_breaks, job_photos, job_checklist_items
--     Eine Kraft, die schon beim Kunden steht, muss ausstempeln können. Wer
--     ihr das verwehrt, nimmt ihr den Lohnnachweis -- das trifft einen
--     Dritten und nicht den zahlungspflichtigen Betrieb. Dasselbe gilt für
--     die Warteschlange eines Telefons, die Tage später zustellt.
--
--   employee_absences
--     Eine Krankmeldung muss immer erfassbar sein.
--
--   complaints, complaint_updates
--     Eine Beschwerde zu blockieren verliert die Beschwerde. Das ist kein
--     Druckmittel, das ist Datenverlust.
--
--   companies
--     Die Inhaberin muss ihre Betriebsdaten pflegen und die Abo-Seite
--     erreichen können. Sonst kann sie nie bezahlen und nie zurückkommen.
--
--   Rechnungen und Angebote
--     Die schreiben nicht über Richtlinien, sondern über
--     SECURITY-DEFINER-Funktionen. Die kommen in einem eigenen Schritt;
--     diese Migration fasst sie nicht an. Bis dahin ist das eine bekannte
--     Lücke und keine stille.
--
-- WARUM NUR `with check`
--
-- Alle betroffenen Richtlinien sind `for all` mit getrenntem `using` und
-- `with check`. `using` entscheidet über SELECT, `with check` über INSERT und
-- UPDATE. Es genügt also, `with check` zu verengen: Lesen und Exportieren
-- bleiben vollständig. `ALTER POLICY` lässt die übrigen Teile unberührt,
-- darum kein drop/create.
--
-- Eine Folge davon, ausdrücklich und geprüft: nach Ablauf sind die Stammdaten
-- auch *nicht mehr archivierbar*. Archivieren ist in diesem Produkt ein
-- UPDATE auf `is_active` -- gelöscht wird nie, `authenticated` hat auf
-- customers nur INSERT/SELECT/UPDATE. Eine Richtlinie sieht in `with check`
-- nur die neue Zeile und kann ein Archivieren nicht von einer Umbenennung
-- unterscheiden; dafür bräuchte es einen Trigger. Nach Ablauf ist der
-- Stammdatenbestand damit schlicht unveränderlich, bis bezahlt wird. Das ist
-- die einfache Variante und als solche gewollt -- nicht die clevere.
--
-- WARUM "KEIN DATENSATZ" ERLAUBT HEISST
--
-- Mandanten aus der Zeit vor der Abo-Tabelle haben keine Zeile in
-- company_subscriptions. Die dürfen nicht plötzlich gesperrt sein. `coalesce`
-- auf true ist damit Absicht und gleichzeitig die Grenze dieser Sperre: wo
-- keine Zeile ist, greift sie nicht. Produktion legt für neue Betriebe eine
-- Zeile an.

/**
 * Darf dieser Betrieb gerade schreiben?
 *
 * Spiegelt `isSubscriptionUsable()` aus lib/subscription.ts: ACTIVE immer,
 * TRIALING nur solange der Testzeitraum läuft. Alles andere (PAST_DUE,
 * PAUSED, CANCELED, UNPAID) ist kein nutzbares Abo.
 *
 * Zwei Wahrheiten über dieselbe Regel sind eine Gefahr; dass sie hier und in
 * TypeScript getrennt stehen, liegt daran, dass die Datenbank die
 * entscheidende Stelle ist und die Oberfläche nur früher und freundlicher
 * abbiegt. supabase/test/subscription-write-lock.test.sql und
 * apps/web/tests/subscription.test.ts halten beide Seiten an denselben
 * Fällen fest.
 */
create or replace function public.company_may_write(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select sub.status = 'ACTIVE'
        or (sub.status = 'TRIALING' and sub.trial_ends_at > now())
    from public.company_subscriptions sub
    where sub.company_id = target_company_id
  ), true);
$$;

comment on function public.company_may_write(uuid) is
  'Laeuft fuer diesen Betrieb ein nutzbares Abo? Ohne Abo-Zeile: ja (Altbestand). Nur fuer Schreibrechte, nie fuer Lesen.';

revoke all on function public.company_may_write(uuid) from public, anon;
grant execute on function public.company_may_write(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- Die Büroarbeit. Je Richtlinie nur `with check` verengt.
-- ---------------------------------------------------------------------------

alter policy "staff can manage own customers" on public.customers
  with check (public.is_company_staff(company_id) and public.company_may_write(company_id));

alter policy "staff can manage own cleaning objects" on public.cleaning_objects
  with check (
    public.is_company_staff(company_id)
    and public.customer_belongs_to_company(customer_id, company_id)
    and public.company_may_write(company_id)
  );

alter policy "staff manage portal contacts" on public.customer_contacts
  with check (public.is_company_staff(company_id) and public.company_may_write(company_id));

alter policy "staff can manage jobs" on public.jobs
  with check (public.is_company_staff(company_id) and public.company_may_write(company_id));

alter policy "staff can manage job assignments" on public.job_assignments
  with check (public.is_company_staff(company_id) and public.company_may_write(company_id));

alter policy "staff can manage schedules" on public.service_schedules
  with check (public.is_company_staff(company_id) and public.company_may_write(company_id));

alter policy "staff can manage schedule assignments" on public.service_schedule_assignments
  with check (public.is_company_staff(company_id) and public.company_may_write(company_id));

alter policy "staff can manage schedule rules" on public.schedule_rules
  with check (
    exists (
      select 1 from public.service_schedules schedule
      where schedule.id = schedule_rules.service_schedule_id
        and public.is_company_staff(schedule.company_id)
        and public.company_may_write(schedule.company_id)
    )
  );

alter policy "staff checklist templates" on public.checklist_templates
  with check (public.is_company_staff(company_id) and public.company_may_write(company_id));

alter policy "staff checklist template items" on public.checklist_template_items
  with check (
    exists (
      select 1 from public.checklist_templates t
      where t.id = checklist_template_items.template_id
        and public.is_company_staff(t.company_id)
        and public.company_may_write(t.company_id)
    )
  );

alter policy "staff manage quality inspections" on public.quality_inspections
  with check (public.is_company_staff(company_id) and public.company_may_write(company_id));
