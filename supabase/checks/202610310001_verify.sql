-- Run in the Supabase SQL editor straight AFTER applying migrations/202610310001_revamp_card.sql. Read-only.
-- Every row should say ok. If one doesn't, run rollback/202610310001_revamp_card.sql: the site falls back to its old reads.
select check_name, case when passed then 'ok' else 'ROLL BACK' end as result, detail from (
 select 'new parts exist' as check_name,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='pg_landmarks' and column_name='attaches_to')
  and to_regprocedure('public.pg_card(text)') is not null and to_regprocedure('public.pg_feature_counts(text[])') is not null
  and to_regprocedure('public.pg_delete_my_account()') is not null as passed, 'attaches_to, pg_card, pg_feature_counts, pg_delete_my_account' as detail
 union all select 'visitors can read cards and counts',
  has_function_privilege('anon','public.pg_card(text)','execute') and has_function_privilege('anon','public.pg_feature_counts(text[])','execute'), 'anon: execute'
 union all select 'only signed-in people can delete their own account',
  not has_function_privilege('anon','public.pg_delete_my_account()','execute') and has_function_privilege('authenticated','public.pg_delete_my_account()','execute'), 'anon: no; authenticated: yes'
 union all select 'private deletion is closed to the API',
  not has_function_privilege('anon','playground_private.delete_account(uuid)','execute') and not has_function_privilege('authenticated','playground_private.delete_account(uuid)','execute')
  and not has_function_privilege('authenticated','playground_private.delete_account(text)','execute'), 'anon, authenticated: no'
 union all select 'browsers still cannot write features',
  not has_table_privilege('anon','public.pg_landmarks','update') or not exists(select 1 from pg_policies where tablename='pg_landmarks' and cmd in ('UPDATE','ALL')),
  'no update policy on pg_landmarks'
 union all select 'a card reads (right hip bone)',
  (public.pg_card('FJ3152')->>'meshId')='FJ3152' and jsonb_array_length(public.pg_card('FJ3152')->'pins')>0, (select jsonb_array_length(public.pg_card('FJ3152')->'pins'))||' pins'
 union all select 'counts read',
  (select count(*) from public.pg_feature_counts(array['FJ3152','FJ3365']))=2, 'right hip bone and right femur'
 union all select 'old pack unchanged',
  (public.pg_published_pack('FJ3152')->>'meshId')='FJ3152', 'pg_published_pack still answers'
) c;
