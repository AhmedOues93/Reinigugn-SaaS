-- Harden helper functions flagged by the database advisor.
-- These helpers do not need caller-controlled schemas; pin resolution to
-- pg_catalog/public without changing their behaviour or grants.

alter function public.calculate_line_minutes(calculation_unit, numeric, numeric, numeric, numeric)
  set search_path = pg_catalog, public;
alter function public.calculate_services_per_month(calculation_frequency, numeric)
  set search_path = pg_catalog, public;
alter function public.cost_to_month(bigint, cost_basis, numeric, numeric, numeric)
  set search_path = pg_catalog, public;
alter function public.derive_productive_rate_bp(numeric, numeric, integer, integer, integer, integer, numeric)
  set search_path = pg_catalog, public;
alter function public.frequency_label(calculation_frequency, numeric)
  set search_path = pg_catalog, public;
alter function public.is_allowed_absence_document_path(text)
  set search_path = pg_catalog, public;
alter function public.is_allowed_avatar_path(text)
  set search_path = pg_catalog, public;
alter function public.is_allowed_branding_path(text)
  set search_path = pg_catalog, public;
alter function public.is_supported_locale(text)
  set search_path = pg_catalog, public;
alter function public.margin_bp(bigint, bigint)
  set search_path = pg_catalog, public;
alter function public.markup_bp(bigint, bigint)
  set search_path = pg_catalog, public;
alter function public.personnel_cost_per_hour(bigint, integer, integer, integer)
  set search_path = pg_catalog, public;
alter function public.price_from_margin(bigint, integer)
  set search_path = pg_catalog, public;
alter function public.weeks_per_month()
  set search_path = pg_catalog, public;
