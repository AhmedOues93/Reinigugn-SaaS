-- Firmendaten speichern: Geschaeftsfuehrung und Umsatzsteuersatz.
--
-- save_company_profile() haelt jeden leeren Wert bewusst fest (coalesce auf
-- den Altwert), weil es aus dem Onboarding-Wizard stammt, der die Felder
-- einzeln schickt. In den Einstellungen schickt das Formular dagegen immer
-- alle Felder: dort bedeutet ein leeres Feld "loeschen". Die Oberflaeche hat
-- das bisher umgangen, indem sie in genau diesem Fall einen Fehler meldete —
-- und dabei DATEV-Einstellungen und Reinigungsschwerpunkte gar nicht erst
-- gespeichert hat.
--
-- Diese Funktion schreibt beide Felder so, wie sie geschickt werden.
-- default_vat_rate_basis_points ist NOT NULL: ein geleertes Feld heisst dort
-- "zurueck auf den gesetzlichen Regelsatz", nicht "kein Steuersatz".

create or replace function public.set_company_management(
  p_managing_director text,
  p_vat_rate_bp integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.company_members;
begin
  -- Wie save_company_profile: diese Angaben stehen auf jeder Rechnung, also
  -- darf sie nur die Inhaberin aendern, nicht das Buero.
  select member.* into actor
  from public.company_members member
  join public.profiles profile on profile.id = member.profile_id
  where profile.auth_user_id = auth.uid()
    and member.role = 'OWNER'
    and member.status = 'ACTIVE'
  limit 1;

  if actor.id is null then
    raise exception 'Only the OWNER may change the company profile';
  end if;

  if p_vat_rate_bp is not null and (p_vat_rate_bp < 0 or p_vat_rate_bp > 10000) then
    raise exception 'VAT rate must be between 0 and 100 percent';
  end if;

  update public.companies
  set
    managing_director = nullif(trim(coalesce(p_managing_director, '')), ''),
    default_vat_rate_basis_points = coalesce(p_vat_rate_bp, 1900)
  where id = actor.company_id;
end;
$$;

revoke all on function public.set_company_management(text, integer) from public, anon;
grant execute on function public.set_company_management(text, integer) to authenticated;
