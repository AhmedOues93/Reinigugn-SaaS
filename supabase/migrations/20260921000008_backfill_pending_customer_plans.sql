-- Backfill previously accepted customer offers that created an active plan
-- without any recurrence rule. These plans cannot generate visits and should
-- be explicitly completed by the office.
update public.service_schedules schedule
set is_active = false,
    updated_at = now()
where schedule.is_active = true
  and not exists (
    select 1
    from public.schedule_rules rule
    where rule.service_schedule_id = schedule.id
      and rule.is_active
  )
  and exists (
    select 1
    from public.quotes quote
    where quote.created_schedule_id = schedule.id
      and quote.status = 'ACCEPTED'
      and quote.accepted_via in ('PUBLIC_LINK', 'PORTAL')
  );
