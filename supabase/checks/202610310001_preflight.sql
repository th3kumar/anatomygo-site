-- Run in the Supabase SQL editor BEFORE applying migrations/202610310001_revamp_card.sql. Read-only: it changes nothing.
-- Every row should say ok. Anything else: stop and look before applying.
select check_name, case when passed then 'ok' else 'STOP' end as result, detail from (
 select 'not applied yet' as check_name,
  not exists(select 1 from information_schema.columns where table_schema='public' and table_name='pg_landmarks' and column_name='attaches_to')
  and to_regprocedure('public.pg_card(text)') is null and to_regprocedure('public.pg_feature_counts(text[])') is null as passed,
  'attaches_to, pg_card, pg_feature_counts must not exist yet' as detail
 union all select 'tables it reads',
  (select count(*) from information_schema.tables where table_schema='public' and table_name in ('pg_structures','pg_landmarks','pg_proposals','pg_votes','pg_profiles','pg_comments','pg_reports'))=7,
  'pg_structures, pg_landmarks, pg_proposals, pg_votes, pg_profiles, pg_comments, pg_reports'
 union all select 'columns it reads',
  (select count(*) from information_schema.columns where table_schema='public' and (table_name,column_name) in (
   ('pg_landmarks','published_proposal'),('pg_landmarks','archived'),('pg_landmarks','mesh_id'),('pg_proposals','shape'),('pg_proposals','status'),
   ('pg_proposals','geometry'),('pg_proposals','author_id'),('pg_structures','geometry'),('pg_votes','value'),('pg_profiles','display_name')))=10,
  'published_proposal, archived, shape, status, geometry, author_id, value, display_name'
 union all select 'private schema and helpers',
  to_regnamespace('playground_private') is not null and to_regprocedure('playground_private.require_user()') is not null
  and to_regclass('playground_private.actions') is not null and to_regclass('playground_private.admins') is not null and to_regclass('playground_private.audit') is not null,
  'playground_private.require_user(), actions, admins, audit'
 union all select 'API roles',
  (select count(*) from pg_roles where rolname in ('anon','authenticated','service_role'))=3, 'anon, authenticated, service_role'
 union all select 'no long transactions now',
  not exists(select 1 from pg_stat_activity where state<>'idle' and xact_start<now()-interval '30 seconds' and pid<>pg_backend_pid()),
  'a long-running query would make the migration wait (it gives up after 3 s and can be run again)'
) c
union all
-- For the record (no pass/fail): the anchor rule in production, and pins past its edge. (On 31 Oct there were none: a
-- right-ulna pin whose u+v reads 1.0000000000000002 through the API is rounding in the API's 15-digit output.)
select 'proposal constraint: '||conname, 'info', pg_get_constraintdef(oid) from pg_constraint where conrelid='public.pg_proposals'::regclass and contype='c'
union all
select 'pins with u+v over 1', 'info', count(*)::text from public.pg_proposals where u+v>1;
