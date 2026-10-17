-- Keep the legacy two-argument RPC compatible while routing every decision
-- through the noted/audited implementation.
create or replace function public.review_absence(
  p_absence_id uuid,
  p_approved boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.review_absence_with_note(
    p_absence_id,
    p_approved,
    case when p_approved then null else 'Vom Büro abgelehnt.' end
  );
end;
$$;

revoke all on function public.review_absence(uuid, boolean) from public, anon;
grant execute on function public.review_absence(uuid, boolean) to authenticated;
