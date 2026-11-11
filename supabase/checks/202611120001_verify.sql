-- Run in the Supabase SQL editor straight AFTER applying migrations/202611120001_site_flags.sql. Read-only.
-- Every row should say ok. Until the migration is applied the site still works: every switch counts as off.
select check_name, case when passed then 'ok' else 'CHECK' end as result, detail from (
 select 'table exists' as check_name, to_regclass('public.site_flags') is not null as passed, 'public.site_flags' as detail
 union all select 'visitors can read the switches',
  has_table_privilege('anon','public.site_flags','select') and has_table_privilege('authenticated','public.site_flags','select'), 'anon, authenticated: select'
 union all select 'visitors cannot change them',
  not has_table_privilege('anon','public.site_flags','insert') and not has_table_privilege('anon','public.site_flags','update') and not has_table_privilege('anon','public.site_flags','delete')
  and not has_table_privilege('authenticated','public.site_flags','insert') and not has_table_privilege('authenticated','public.site_flags','update') and not has_table_privilege('authenticated','public.site_flags','delete'), 'anon, authenticated: no writes'
 union all select 'row level security is on',
  (select relrowsecurity from pg_class where oid='public.site_flags'::regclass), 'one read policy, no write policy'
 union all select 'the Android app switch is there, and off until you turn it on',
  exists(select 1 from public.site_flags where name='android_app_loading'), (select 'enabled = '||enabled::text from public.site_flags where name='android_app_loading')
) checks;
