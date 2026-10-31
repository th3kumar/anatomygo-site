-- Minimal Supabase Auth surface for isolated PostgreSQL permission tests only.
do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin;end if;end;$$;
do $$begin if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin;end if;end;$$;
do $$begin if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls;end if;end;$$;
-- Supabase's defaults: everything new in public is granted to the API roles, so a migration that forgets to revoke
-- leaves a table or function open. The tests run under the same defaults.
grant usage on schema public to anon,authenticated,service_role;
alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
alter default privileges in schema public grant all on functions to anon,authenticated,service_role;
alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;
create schema auth;
create table auth.users(id uuid primary key,email text);
-- As Supabase defines it: PostgREST 12 sets request.jwt.claims; older tooling sets request.jwt.claim.sub.
create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
grant usage on schema auth to anon,authenticated;
grant execute on function auth.uid(),auth.jwt() to anon,authenticated;
