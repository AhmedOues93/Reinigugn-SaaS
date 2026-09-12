-- Ensure template assignment is validated when an existing plan or job is changed.
drop trigger if exists service_schedules_validate_company on public.service_schedules;
create trigger service_schedules_validate_company
before insert or update of company_id, customer_id, cleaning_object_id, checklist_template_id on public.service_schedules
for each row execute procedure public.ensure_schedule_company_integrity();

drop trigger if exists jobs_validate_company on public.jobs;
create trigger jobs_validate_company
before insert or update of company_id, customer_id, cleaning_object_id, service_schedule_id, checklist_template_id on public.jobs
for each row execute procedure public.ensure_job_company_integrity();
