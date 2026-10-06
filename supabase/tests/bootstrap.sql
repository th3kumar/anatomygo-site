-- Minimal Supabase Auth surface for isolated PostgreSQL permission tests only.
do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin;end if;end;$$;
do $$begin if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin;end if;end;$$;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
grant usage on schema auth to anon,authenticated;
grant execute on function auth.uid(),auth.jwt() to anon,authenticated;
