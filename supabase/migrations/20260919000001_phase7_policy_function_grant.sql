-- RLS policies invoke this narrow current-member helper as the authenticated role.
grant execute on function public.phase7_current_member() to authenticated;
