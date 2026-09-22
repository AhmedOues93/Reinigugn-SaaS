-- Notification types used by the employee shift reminder scheduler.
alter type public.notification_type add value if not exists 'JOB_START_SOON';
alter type public.notification_type add value if not exists 'JOB_START_OVERDUE';
