-- New enum values must be committed before they can be used, so the portal
-- notification type is added in its own migration ahead of phase 10.
alter type public.notification_type add value if not exists 'COMPLAINT_CREATED';
