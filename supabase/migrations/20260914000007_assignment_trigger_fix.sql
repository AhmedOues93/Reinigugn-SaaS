-- A trigger function must not access row fields that do not exist on every attached table.
create or replace function public.ensure_job_assignment_company_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_active_employee_member(new.member_id, new.company_id) then raise exception 'Assigned member must be an active employee of the same company'; end if;
  if not exists (select 1 from public.jobs job where job.id = new.job_id and job.company_id = new.company_id) then raise exception 'Assignment job must belong to the same company'; end if;
  return new;
end;
$$;

create or replace function public.ensure_schedule_assignment_company_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_active_employee_member(new.member_id, new.company_id) then raise exception 'Assigned member must be an active employee of the same company'; end if;
  if not exists (select 1 from public.service_schedules schedule where schedule.id = new.service_schedule_id and schedule.company_id = new.company_id) then raise exception 'Assignment schedule must belong to the same company'; end if;
  return new;
end;
$$;

drop trigger if exists job_assignments_validate_company on public.job_assignments;
create trigger job_assignments_validate_company before insert or update of company_id, job_id, member_id on public.job_assignments for each row execute procedure public.ensure_job_assignment_company_integrity();
drop trigger if exists schedule_assignments_validate_company on public.service_schedule_assignments;
create trigger schedule_assignments_validate_company before insert or update of company_id, service_schedule_id, member_id on public.service_schedule_assignments for each row execute procedure public.ensure_schedule_assignment_company_integrity();
