-- A Leistungsnachweis in the customer portal must describe work that was
-- actually performed.
--
-- list_my_portal_service_records already restricts the list to
-- job.status = 'COMPLETED', but get_my_portal_service_record — the detail
-- behind /portal/leistungen/<id> — joined public.jobs with no such condition.
-- The URL is guessable and stays valid after a visit is rescheduled, so a
-- customer could open a PLANNED visit and be shown a page headed
-- "Leistungsnachweis" carrying no working time, an untouched checklist, no
-- photos and a blank Kundenabnahme. That is a document about work nobody has
-- done yet, and it is the customer-facing half of the gate the office side
-- already has (hasStoredServiceRecord).
--
-- The gate is the service record itself, not the job status: public.service_records
-- gains its row only once the work is finished — on completion, or for
-- VOR_ORT_UNTERSCHRIFT once the time entries are closed and the signature is
-- pending. Joining it therefore admits exactly the visits that have a real
-- record, including one still waiting on portal acceptance, and excludes every
-- visit that has not been performed.
--
-- Same argument list as the existing function, so this replaces it rather than
-- adding an overload.
create or replace function public.get_my_portal_service_record(p_job_id uuid)
returns table (job_id uuid, scheduled_date date, object_name text, title text, status public.job_status, duration_minutes integer, items jsonb)
language sql stable security definer set search_path = public as $$
  select
    job.id,
    job.scheduled_date,
    object.name,
    job.title,
    job.status,
    coalesce((select sum(entry.duration_minutes)::integer from public.job_time_entries entry where entry.job_id = job.id and entry.finished_at is not null), 0),
    coalesce((
      select jsonb_agg(jsonb_build_object('title', item.title, 'completed', item.completed_at is not null) order by item.position)
      from public.job_checklists list
      join public.job_checklist_items item on item.job_checklist_id = list.id
      where list.job_id = job.id
    ), '[]'::jsonb)
  from public.current_customer_contact() contact
  join public.jobs job on job.id = p_job_id and job.customer_id = contact.customer_id and job.company_id = contact.company_id
  join public.cleaning_objects object on object.id = job.cleaning_object_id
  join public.service_records record
    on record.job_id = job.id and record.company_id = job.company_id;
$$;
