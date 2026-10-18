-- 20261006000007 added p_acceptance_policy to
-- public.create_quote_from_calculation. `create or replace function` matches on
-- the argument list, so adding a parameter did not replace the previous
-- function: it created a second overload beside it.
--
-- Both signatures then answered to the same name with defaults for every
-- argument after the first, so any call that does not spell out all five
-- arguments is ambiguous and PostgreSQL rejects it with "function
-- public.create_quote_from_calculation(unknown) is not unique". That takes out
-- the Kalkulation SQL suite and would take out any caller that relies on the
-- defaults.
--
-- The five-argument version supersedes the old one in full — the acceptance
-- policy defaults to KEINE_ABNAHME_ERFORDERLICH, which is what the four
-- argument version always implied — so the old signature is dropped rather
-- than kept for compatibility.
drop function if exists public.create_quote_from_calculation(
  uuid, text, integer, public.billing_mode
);
