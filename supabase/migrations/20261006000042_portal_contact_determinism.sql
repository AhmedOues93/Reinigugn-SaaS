-- `current_customer_contact()` beantwortete eine Frage nicht, die sie stellt.
--
-- Die Funktion ist der einzige Engpass des Kundenportals: dreizehn Funktionen
-- lesen durch sie, und sie entscheidet, welcher Kunde welchen Betriebs
-- gezeigt wird. Sie endete mit `limit 1` ohne `order by`.
--
-- Solange eine Person nur bei einem Betrieb Ansprechpartnerin ist, gibt es
-- genau eine Zeile und das faellt nicht auf. Zwei Beziehungen sind aber
-- erlaubt und kommen vor: `company_members` ist nur *je Betrieb* eindeutig
-- (`unique (company_id, profile_id)`), und `customer_contacts.member_id` ist
-- eindeutig je Mitgliedschaft. Eine Hausverwaltung, die bei zwei
-- Reinigungsbetrieben Kundin ist, hat also zwei Zeilen -- und `limit 1` ohne
-- `order by` darf dann jede davon liefern, von Aufruf zu Aufruf verschieden.
--
-- Die Folge ist nicht eine Offenlegung an Fremde: beide Beziehungen sind
-- legitim. Sie ist schlimmer zu bemerken -- das Portal zeigt Rechnungen,
-- Einsaetze und Leistungsnachweise des einen Betriebs, der Kopf darueber
-- womoeglich den anderen, und beim naechsten Aufruf umgekehrt. Niemand
-- bekommt eine Fehlermeldung.
--
-- Hier wird nur die Reihenfolge festgelegt: die aeltere Beziehung gewinnt,
-- und zwar immer dieselbe. `created_at` allein genuegt nicht als Schluessel,
-- weil zwei Zeilen in derselben Transaktion entstehen koennen; die Kennung
-- entscheidet dann.
--
-- Bekannte Grenze, hier bewusst nicht geaendert: wer bei zwei Betrieben
-- Kundin ist, sieht weiterhin nur die aeltere Beziehung und kann nicht
-- wechseln. Das zu aendern waere eine neue Funktion (eine Betriebsauswahl im
-- Portal) und gehoert nicht in eine Fehlerbehebung. Dokumentiert in
-- docs/runbook.md.

create or replace function public.current_customer_contact()
returns public.customer_contacts
language sql
stable
security definer
set search_path = public
as $$
  select contact.*
  from public.customer_contacts contact
  join public.company_members member on member.id = contact.member_id
  join public.profiles profile on profile.id = member.profile_id
  where profile.auth_user_id = auth.uid()
    and member.role = 'CUSTOMER'
    and member.status = 'ACTIVE'
  order by contact.created_at, contact.id
  limit 1;
$$;

revoke all on function public.current_customer_contact() from public, anon;
grant execute on function public.current_customer_contact() to authenticated;
