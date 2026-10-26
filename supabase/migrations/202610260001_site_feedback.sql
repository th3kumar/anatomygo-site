-- Website feedback: anyone may send a message, with an optional email for a reply. Messages live in a private schema
-- that the public API cannot read; the team reads them in the Supabase dashboard (schema site_private, table feedback).
create schema site_private;
revoke all on schema site_private from public, anon, authenticated;

create table site_private.feedback(
 id uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default now(),
 message text not null check(char_length(message) between 2 and 2000),
 email text check(email is null or (char_length(email)<=254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
 source text not null check(source in ('prompt','about')),
 -- Coarse context only: device class, minutes of use, structures opened. Never anything the visitor typed elsewhere.
 context jsonb not null default '{}' check(jsonb_typeof(context)='object' and octet_length(context::text)<=500)
);
create index feedback_created on site_private.feedback(created_at desc);
alter table site_private.feedback enable row level security;
revoke all on site_private.feedback from public, anon, authenticated;

-- The only way in. Blank email becomes null. A flood guard caps the whole site at 30 messages a minute, and the same
-- message sent again within ten minutes (a double click, a retry) is stored once.
create function public.site_feedback_submit(p_message text,p_email text,p_source text,p_context jsonb default '{}')
returns void language plpgsql security definer set search_path='' as $$
declare v_message text := btrim(coalesce(p_message,'')); v_email text := nullif(btrim(coalesce(p_email,'')),'');
begin
 if (select count(*) from site_private.feedback where created_at>now()-interval '1 minute')>=30 then
  raise exception 'Too many messages right now. Please try again in a minute.';
 end if;
 if exists(select 1 from site_private.feedback f where f.message=v_message and f.created_at>now()-interval '10 minutes') then return; end if;
 insert into site_private.feedback(message,email,source,context) values(v_message,v_email,p_source,coalesce(p_context,'{}'));
end;$$;
revoke all on function public.site_feedback_submit(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.site_feedback_submit(text,text,text,jsonb) to anon,authenticated;
