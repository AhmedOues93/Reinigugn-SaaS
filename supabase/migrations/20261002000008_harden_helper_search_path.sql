-- Harden helper functions that already exist at this point in the migration
-- history. Some costing helpers are introduced by Phase 21 (20261003), so this
-- migration intentionally discovers functions by name instead of assuming a
-- later signature exists already.

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
        'calculate_line_minutes',
        'calculate_services_per_month',
        'personnel_cost_per_hour',
        'cost_to_month',
        'price_from_margin',
        'margin_bp',
        'markup_bp',
        'is_allowed_absence_document_path',
        'is_supported_locale',
        'is_allowed_branding_path',
        'is_allowed_avatar_path',
        'weeks_per_month',
        'derive_productive_rate_bp',
        'frequency_label'
      ])
  loop
    execute format('alter function %s set search_path = pg_catalog, public', fn.signature);
  end loop;
end;
$$;
