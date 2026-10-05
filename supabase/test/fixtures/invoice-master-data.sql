-- Complete synthetic billing fixtures in the disposable test database.
-- Keep every existing value, name and JWT; only missing billing fields change.
select set_config('test.invoice_fixture_role', current_setting('role'), true);
reset role;
update public.companies set
  street = coalesce(nullif(btrim(street), ''), 'Testweg 1'),
  postal_code = coalesce(nullif(btrim(postal_code), ''), '20095'),
  city = coalesce(nullif(btrim(city), ''), 'Hamburg'),
  tax_number = case when nullif(btrim(tax_number), '') is null and nullif(btrim(vat_id), '') is null
    then '12/345/67890' else tax_number end;
update public.customers set
  billing_address = coalesce(nullif(btrim(billing_address), ''), 'Kundenweg 2'),
  postal_code = coalesce(nullif(btrim(postal_code), ''), '20095'),
  city = coalesce(nullif(btrim(city), ''), 'Hamburg');
select set_config('role', current_setting('test.invoice_fixture_role'), true);
