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

-- Re-assert the exact anonymous allow-list.
revoke execute on function public.get_invitation_preview(text) from public;
grant execute on function public.get_invitation_preview(text) to anon, authenticated;

revoke execute on function public.get_invitation_state(text) from public;
grant execute on function public.get_invitation_state(text) to anon, authenticated;

revoke execute on function public.get_public_quote(text) from public;
grant execute on function public.get_public_quote(text) to anon, authenticated;

revoke execute on function public.accept_public_quote(text, text, text) from public;
grant execute on function public.accept_public_quote(text, text, text) to anon, authenticated;
