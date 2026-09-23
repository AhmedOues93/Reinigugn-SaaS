-- Keep enum evolution in its own migration. PostgreSQL requires a newly added
-- enum value to be committed before later migrations use it.
alter type public.notification_type add value if not exists 'JOB_ASSIGNED';
