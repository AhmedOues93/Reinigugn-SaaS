-- Phase 23: production auth hardening.
-- SECURITY DEFINER functions are executable by PUBLIC unless explicitly revoked.
-- Keep only the token-gated public endpoints anonymous; everything else is
-- authenticated-only. Existing authenticated behavior is preserved.

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname not in (
        'get_invitation_preview',
        'get_invitation_state',
        'get_public_quote',
        'accept_public_quote'
      )
  loop
    execute format('revoke execute on function %s from public, anon', fn.signature);
    execute format('grant execute on function %s to authenticated', fn.signature);
  end loop;
end
$$;

-- The public endpoints are created by later migrations on a fresh database.
-- Re-assert privileges only for signatures that already exist at this point.
do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.get_invitation_preview(text)',
    'public.get_invitation_state(text)',
    'public.get_public_quote(text)',
    'public.accept_public_quote(text,text,text)'
  ]
  loop
    if to_regprocedure(signature) is not null then
      execute format('revoke execute on function %s from public', signature);
      execute format('grant execute on function %s to anon, authenticated', signature);
    end if;
  end loop;
end
$$;
