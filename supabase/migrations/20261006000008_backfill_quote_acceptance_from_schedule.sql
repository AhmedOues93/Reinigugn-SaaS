-- Preserve the actual historical acceptance term for already accepted offers.
update public.quotes q
set acceptance_policy = s.acceptance_policy
from public.service_schedules s
where q.created_schedule_id = s.id
  and q.status = 'ACCEPTED'
  and q.acceptance_policy is distinct from s.acceptance_policy;
