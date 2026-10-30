-- Legacy production grants differed from the clean-database schema. These
-- actor selectors are called only by SECURITY DEFINER business routines, not
-- RLS policies or browser RPCs. Preserve phase7_current_member's policy grant.
revoke all on function public.billing_actor() from public, anon, authenticated;
revoke all on function public.sales_actor() from public, anon, authenticated;
revoke all on function public.messaging_actor() from public, anon, authenticated;
revoke all on function public.current_employee_member() from public, anon, authenticated;
