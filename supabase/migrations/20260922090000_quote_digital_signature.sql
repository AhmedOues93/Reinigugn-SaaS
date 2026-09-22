alter table public.quotes
  add column if not exists accepted_signature_text text;

create or replace function public.accept_public_quote_signed(
  p_token text,
  p_name text,
  p_signature text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  signature_text text := trim(coalesce(p_signature, ''));
begin
  if char_length(signature_text) < 2 or char_length(signature_text) > 160 then
    raise exception 'Please enter your signature';
  end if;

  result := public.accept_public_quote(p_token, p_name, p_note);

  update public.quotes
  set accepted_signature_text = signature_text,
      updated_at = now()
  where public_token_hash = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'::text), 'hex')
    and status = 'ACCEPTED';

  if not found then
    raise exception 'Offer signature could not be stored';
  end if;

  return result;
end;
$$;

create or replace function public.get_public_quote_v2(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb;
  signature_text text;
  quote_id uuid;
begin
  payload := public.get_public_quote(p_token);
  if payload is null then return null; end if;

  quote_id := nullif(payload->>'id', '')::uuid;
  if quote_id is not null then
    select accepted_signature_text into signature_text
    from public.quotes
    where id = quote_id;
  end if;

  return payload || jsonb_build_object('accepted_signature_text', signature_text);
end;
$$;

revoke all on function public.accept_public_quote_signed(text,text,text,text) from public;
revoke all on function public.get_public_quote_v2(text) from public;
grant execute on function public.accept_public_quote_signed(text,text,text,text) to anon, authenticated;
grant execute on function public.get_public_quote_v2(text) to anon, authenticated;
