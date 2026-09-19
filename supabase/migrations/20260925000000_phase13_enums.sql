-- Phase 13 prerequisites. New enum values must be committed before they can be
-- used, so they get their own migration ahead of the phase.
alter type public.notification_type add value if not exists 'MESSAGE_RECEIVED';
