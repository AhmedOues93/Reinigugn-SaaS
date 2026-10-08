-- Phase 25 was originally committed with a timestamp that sorts before the
-- Phase 12 sales migration that creates public.quotes. Keep this historical
-- migration as a no-op so clean installs remain ordered and existing cloud
-- migration history is not rewritten. The actual function replacement lives in
-- 20261005000000_phase25_quote_snapshot_details.sql.
select 1;
