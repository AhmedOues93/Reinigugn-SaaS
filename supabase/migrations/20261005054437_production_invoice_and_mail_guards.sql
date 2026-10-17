-- Supabase projects may automatically grant new functions to authenticated.
-- Provider events must only be written by the signature-verifying webhook.
revoke all on function public.record_mail_event(text, text, text, text, text, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_mail_event(text, text, text, text, text, timestamptz, jsonb)
  to service_role;

-- Check the actual document snapshots, rather than today's master data after
-- issuance. A trigger protects RPC and direct writes; failed issuance rolls
-- back the counter increment as part of the same statement.
create or replace function public.validate_invoice_issue_master_data()
returns trigger language plpgsql set search_path = public as $$
declare
  missing text[] := array[]::text[];
  field text;
begin
  if new.status <> 'ISSUED' then return new; end if;
  if tg_op = 'UPDATE' then
    if old.status <> 'DRAFT' then return new; end if;
  end if;

  foreach field in array array['name', 'street', 'postal_code', 'city'] loop
    if nullif(btrim(new.company_snapshot ->> field), '') is null then
      missing := array_append(missing, 'company.' || field);
    end if;
  end loop;
  if nullif(btrim(new.company_snapshot ->> 'tax_number'), '') is null
     and nullif(btrim(new.company_snapshot ->> 'vat_id'), '') is null then
    missing := array_append(missing, 'company.tax_identifier');
  end if;
  foreach field in array array['name', 'billing_address', 'postal_code', 'city'] loop
    if nullif(btrim(new.customer_snapshot ->> field), '') is null then
      missing := array_append(missing, 'customer.' || field);
    end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception using message = 'Invoice master data incomplete',
      detail = array_to_string(missing, ',');
  end if;
  return new;
end;
$$;
revoke all on function public.validate_invoice_issue_master_data() from public, anon, authenticated;
drop trigger if exists invoices_validate_issue_master_data on public.invoices;
create trigger invoices_validate_issue_master_data
  before insert or update on public.invoices
  for each row execute function public.validate_invoice_issue_master_data();
