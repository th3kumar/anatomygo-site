-- Run in the Supabase SQL editor straight AFTER applying migrations/202611050001_search_asks.sql. Read-only.
-- Every row should say ok. Until the migration is applied the site still works: Ask for it records the analytics event
-- only (the call to site_search_ask fails quietly).
select check_name, case when passed then 'ok' else 'CHECK' end as result, detail from (
 select 'table and function exist' as check_name,
  to_regclass('site_private.search_asks') is not null and to_regprocedure('public.site_search_ask(text,text)') is not null as passed,
  'site_private.search_asks, public.site_search_ask' as detail
 union all select 'visitors can ask',
  has_function_privilege('anon','public.site_search_ask(text,text)','execute'), 'anon: execute'
 union all select 'visitors cannot read or write the table',
  not has_table_privilege('anon','site_private.search_asks','select') and not has_table_privilege('anon','site_private.search_asks','insert')
  and not has_table_privilege('authenticated','site_private.search_asks','select'), 'anon, authenticated: no'
 union all select 'the schema stays closed to the API',
  not has_schema_privilege('anon','site_private','usage'), 'anon: no usage on site_private'
) c;
