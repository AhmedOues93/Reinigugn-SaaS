-- A public offer signature is an acceptance record, not an editable profile field.
-- Lock the offer before acceptance to serialize simultaneous clicks. The
-- existing accept_public_quote() performs the actual acceptance transaction.
create or replace function public.accept_public_quote_signed(
  p_token text, p_name text, p_signature text, p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  target public.quotes;
  signature_text text := trim(coalesce(p_signature, ''));
  result jsonb;
begin
  if p_token is null or length(p_token) < 32 or length(p_token) > 256 then
    raise exception 'Invalid offer link';
  end if;
  if char_length(signature_text) < 2 or char_length(signature_text) > 160 then
    raise exception 'Please enter your signature';
  end if;

  select * into target
  from public.quotes
  where public_token_hash = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'::text), 'hex')
    and public_access_expires_at > now()
  for update;

  if target.id is null then raise exception 'Offer link is invalid or expired'; end if;
  if target.status <> 'SENT' or target.accepted_signature_text is not null then
    raise exception 'Offer has already been decided';
  end if;

  result := public.accept_public_quote(p_token, p_name, p_note);

  update public.quotes
  set accepted_signature_text = signature_text, updated_at = now()
  where id = target.id
    and status = 'ACCEPTED'
    and accepted_signature_text is null;
  if not found then raise exception 'Offer signature could not be stored'; end if;
  return result;
end;
$function$;

revoke all on function public.accept_public_quote_signed(text, text, text, text) from public;
grant execute on function public.accept_public_quote_signed(text, text, text, text) to anon, authenticated;
