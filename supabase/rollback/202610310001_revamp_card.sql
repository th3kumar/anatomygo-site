-- Undoes supabase/migrations/202610310001_revamp_card.sql. Nothing that existed before it depends on these, and the
-- revamp's client falls back to its old reads when pg_card or pg_feature_counts is missing.
set lock_timeout='3s';
drop function if exists public.pg_delete_my_account();
drop function if exists public.pg_card(text);
drop function if exists public.pg_feature_counts(text[]);
drop trigger if exists validate_attachment on public.pg_landmarks;
drop function if exists playground_private.validate_attachment();
alter table public.pg_landmarks drop column if exists attaches_to;
